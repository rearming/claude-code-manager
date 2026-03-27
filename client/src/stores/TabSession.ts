import { makeAutoObservable, runInAction } from 'mobx';
import type { SessionDetail, ForkResult, ImageAttachment, ConversationMessage, ToolCallSummary } from '../types';
import { fetchSessionDetail, resumeSession, forkSessionAt, streamMessageToSession, streamNewSession, fetchSessionStatus, subscribeToSession } from '../api';

export interface StreamingToolCall {
  id?: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'done';
  _rawInput?: string;
}

export type StreamingBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id?: string; name: string; input: Record<string, unknown>; status: 'running' | 'done'; _rawInput?: string };

let nextTabId = 1;

/**
 * Encapsulates all per-tab session state.
 * Each tab has its own streaming, terminal, and session detail state.
 */
export class TabSession {
  /** Internal tab identifier (stable, even before sessionId is known) */
  readonly tabId: string;

  /** Claude session ID (null for new sessions before onInit fires) */
  sessionId: string | null;

  // Session data
  selectedDetail: SessionDetail | null = null;
  detailLoading = false;

  // Streaming state
  sending = false;
  streamingText = '';
  streamingToolCalls: StreamingToolCall[] = [];
  streamingBlocks: StreamingBlock[] = [];
  committedStreamingMessages: ConversationMessage[] = [];
  abortStream: (() => void) | null = null;
  pendingUserMessage: string | null = null;
  pendingImages: ImageAttachment[] | null = null;
  scrollToBottomOnLoad = false;

  // Terminal state
  rawLines: string[] = [];
  terminalInput = '';
  lastRawEventTime = 0;

  // Per-tab action state
  resumeCommand: string | null = null;
  forkResult: ForkResult | null = null;
  forking = false;
  error: string | null = null;
  reconnectedSessionId: string | null = null;

  // Callbacks to parent store
  private _onSessionsChanged: () => void;
  private _getDangerouslySkipPermissions: () => boolean;
  private _getCustomName: (sessionId: string) => string | undefined;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _rawLinesPersistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    sessionId: string | null,
    onSessionsChanged: () => void,
    getDangerouslySkipPermissions: () => boolean,
    getCustomName: (sessionId: string) => string | undefined,
  ) {
    this.tabId = `tab-${nextTabId++}`;
    this.sessionId = sessionId;
    this._onSessionsChanged = onSessionsChanged;
    this._getDangerouslySkipPermissions = getDangerouslySkipPermissions;
    this._getCustomName = getCustomName;
    makeAutoObservable<TabSession, '_onSessionsChanged' | '_getDangerouslySkipPermissions' | '_getCustomName' | '_reconnectTimer' | '_rawLinesPersistTimer'>(this, {
      _onSessionsChanged: false,
      _getDangerouslySkipPermissions: false,
      _getCustomName: false,
      _reconnectTimer: false,
      _rawLinesPersistTimer: false,
    });
  }

  /** Display title for the tab */
  get title(): string {
    if (this.sessionId) {
      const custom = this._getCustomName(this.sessionId);
      if (custom) return custom;
    }
    if (this.selectedDetail) {
      const s = this.selectedDetail.summary;
      return s.slug?.replaceAll('-', ' ') || s.firstMessage.slice(0, 40) || 'untitled';
    }
    if (this.pendingUserMessage) {
      return this.pendingUserMessage.slice(0, 40) || 'new session';
    }
    return 'new session';
  }

  // ── Raw event processing ──────────────────────────────────

  appendRawLine(line: string) {
    this.rawLines.push(line);
    if (this.rawLines.length > 1000) {
      this.rawLines = this.rawLines.slice(-800);
    }
    this.lastRawEventTime = Date.now();

    try {
      const event = JSON.parse(line);
      this.processStreamEvent(event);
    } catch {
      // Not JSON — skip
    }
  }

  private processStreamEvent(event: Record<string, unknown>) {
    if (event.type === 'content_block_start') {
      const block = (event as { content_block?: { type: string; id?: string; name?: string }; index?: number }).content_block;
      if (block?.type === 'tool_use' && block.name) {
        const exists = block.id && this.streamingToolCalls.some(tc => tc.id === block.id);
        if (!exists) {
          const toolCall: StreamingToolCall = { id: block.id, name: block.name, input: {}, status: 'running' };
          this.streamingToolCalls.push(toolCall);
          this.streamingBlocks.push({ type: 'tool_use', id: block.id, name: block.name, input: {}, status: 'running' });
        }
      }
      if (block?.type === 'text') {
        for (const tc of this.streamingToolCalls) { if (tc.status === 'running') tc.status = 'done'; }
        for (const b of this.streamingBlocks) { if (b.type === 'tool_use' && b.status === 'running') b.status = 'done'; }
        this.streamingBlocks.push({ type: 'text', text: '' });
      }
    }

    if (event.type === 'content_block_delta') {
      const delta = (event as { delta?: { type?: string; partial_json?: string; text?: string } }).delta;
      if (delta?.type === 'text_delta' && delta.text) {
        const lastText = [...this.streamingBlocks].reverse().find(b => b.type === 'text');
        if (lastText && lastText.type === 'text') {
          lastText.text += delta.text;
        } else {
          this.streamingBlocks.push({ type: 'text', text: delta.text });
        }
      }
      if (delta?.type === 'input_json_delta' && delta.partial_json) {
        const lastRunning = [...this.streamingToolCalls].reverse().find(tc => tc.status === 'running');
        if (lastRunning) {
          const raw = (lastRunning._rawInput || '') + delta.partial_json;
          lastRunning._rawInput = raw;
          try { lastRunning.input = JSON.parse(raw); } catch { /* incomplete */ }
        }
        const lastToolBlock = [...this.streamingBlocks].reverse().find(b => b.type === 'tool_use' && b.status === 'running');
        if (lastToolBlock && lastToolBlock.type === 'tool_use') {
          const raw = (lastToolBlock._rawInput || '') + delta.partial_json;
          lastToolBlock._rawInput = raw;
          try { lastToolBlock.input = JSON.parse(raw); } catch { /* incomplete */ }
        }
      }
    }

    if (event.type === 'assistant') {
      const msg = event.message as {
        content?: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }>;
        model?: string;
      } | undefined;
      if (msg?.content && Array.isArray(msg.content)) {
        const textParts: string[] = [];
        const toolCalls: ToolCallSummary[] = [];
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) textParts.push(block.text);
          if (block.type === 'tool_use' && block.name) {
            toolCalls.push({
              name: block.name,
              input: typeof block.input === 'string' ? { raw: block.input } : (block.input || {}),
            });
          }
        }
        const text = textParts.join('\n');
        if (text || toolCalls.length > 0) {
          this.committedStreamingMessages.push({
            uuid: (event.uuid as string) || `streaming-${Date.now()}-${this.committedStreamingMessages.length}`,
            parentUuid: (event.parentUuid as string) || null,
            type: 'assistant',
            timestamp: (event.timestamp as string) || new Date().toISOString(),
            content: text,
            model: msg.model,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            isSidechain: false,
          });
        }
        this.streamingText = '';
        this.streamingBlocks = [];
        this.streamingToolCalls = [];
      }
    }

    if (event.type === 'result') {
      for (const tc of this.streamingToolCalls) { if (tc.status === 'running') tc.status = 'done'; }
      for (const b of this.streamingBlocks) { if (b.type === 'tool_use' && b.status === 'running') b.status = 'done'; }
    }
  }

  clearRawLines() {
    this.rawLines = [];
  }

  setTerminalInput(value: string) {
    this.terminalInput = value;
  }

  // ── Session loading ───────────────────────────────────────

  async loadDetail(sessionId: string) {
    this.sessionId = sessionId;
    this.selectedDetail = null;
    this.detailLoading = true;
    this.resumeCommand = null;
    this.streamingText = '';
    this.streamingBlocks = [];
    this.committedStreamingMessages = [];
    try {
      const detail = await fetchSessionDetail(sessionId);
      runInAction(() => {
        this.selectedDetail = detail;
        this.detailLoading = false;
      });
      if (!this.sending) {
        this.tryReconnectToStream(sessionId);
      }
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : 'Unknown error';
        this.detailLoading = false;
      });
    }
  }

  async reloadSession(sessionId: string, retryForNewMessages = false) {
    this.sessionId = sessionId;
    const previousCount = this.selectedDetail?.messages?.length || 0;
    const MAX_ATTEMPTS = retryForNewMessages ? 6 : 1;
    const INITIAL_DELAY = 400;
    const RETRY_DELAY = 800;

    if (retryForNewMessages) {
      await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const detail = await fetchSessionDetail(sessionId);
        if (retryForNewMessages && attempt < MAX_ATTEMPTS - 1 && detail.messages.length <= previousCount) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }
        runInAction(() => {
          this.selectedDetail = detail;
          this.streamingText = '';
          this.streamingBlocks = [];
          this.committedStreamingMessages = [];
          this.detailLoading = false;
        });
        return;
      } catch (e) {
        if (retryForNewMessages && attempt < MAX_ATTEMPTS - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }
        runInAction(() => {
          this.error = e instanceof Error ? e.message : 'Unknown error';
          this.streamingText = '';
          this.streamingBlocks = [];
          this.committedStreamingMessages = [];
          this.detailLoading = false;
        });
        return;
      }
    }
  }

  // ── Actions ───────────────────────────────────────────────

  async resume(sessionId: string) {
    try {
      const result = await resumeSession(sessionId);
      runInAction(() => { this.resumeCommand = result.command; });
    } catch (e) {
      runInAction(() => { this.error = e instanceof Error ? e.message : 'Unknown error'; });
    }
  }

  async forkFromMessage(sessionId: string, messageUuid: string) {
    this.forking = true;
    this.forkResult = null;
    try {
      const result = await forkSessionAt(sessionId, messageUuid);
      runInAction(() => {
        this.forkResult = result;
        this.forking = false;
        this._onSessionsChanged();
      });
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : 'Fork failed';
        this.forking = false;
      });
    }
  }

  sendMessage(sessionId: string, message: string, images?: ImageAttachment[]) {
    this.sending = true;
    this.streamingText = '';
    this.pendingUserMessage = message;
    this.pendingImages = images || null;
    this.error = null;
    this.clearRawLines();
    this.streamingToolCalls = [];
    this.streamingBlocks = [];
    this.committedStreamingMessages = [];

    const abort = streamMessageToSession(sessionId, message, this._getDangerouslySkipPermissions(), {
      images: images,
      onText: (text) => { runInAction(() => { this.streamingText += text; }); },
      onRaw: (data) => { runInAction(() => { this.appendRawLine(data); }); },
      onResult: (data) => {
        runInAction(() => {
          if (data.result && this.committedStreamingMessages.length === 0) {
            this.streamingText = data.result;
          }
        });
      },
      onError: (error) => {
        runInAction(() => {
          this.error = error;
          this.sending = false;
          this.pendingUserMessage = null;
          this.pendingImages = null;
        });
      },
      onDone: () => {
        runInAction(() => {
          this.sending = false;
          this.pendingUserMessage = null;
          this.pendingImages = null;
          this.abortStream = null;
          this.scrollToBottomOnLoad = true;
          this.reloadSession(sessionId, true);
        });
      },
    });

    this.abortStream = abort;
  }

  startNewSession(message: string, projectPath: string, images?: ImageAttachment[]) {
    this.sending = true;
    this.streamingText = '';
    this.pendingUserMessage = message;
    this.pendingImages = images || null;
    this.error = null;
    this.selectedDetail = null;
    this.clearRawLines();
    this.streamingToolCalls = [];
    this.streamingBlocks = [];
    this.committedStreamingMessages = [];

    const abort = streamNewSession(message, projectPath, this._getDangerouslySkipPermissions(), {
      images: images,
      onInit: (data) => {
        runInAction(() => {
          this.sessionId = data.sessionId;
          this._onSessionsChanged();
        });
      },
      onText: (text) => { runInAction(() => { this.streamingText += text; }); },
      onRaw: (data) => { runInAction(() => { this.appendRawLine(data); }); },
      onResult: (data) => {
        runInAction(() => {
          if (data.result && this.committedStreamingMessages.length === 0) {
            this.streamingText = data.result;
          }
        });
      },
      onError: (error) => {
        runInAction(() => {
          this.error = error;
          this.sending = false;
          this.pendingUserMessage = null;
          this.pendingImages = null;
        });
      },
      onDone: () => {
        runInAction(() => {
          this.sending = false;
          this.pendingUserMessage = null;
          this.pendingImages = null;
          this.abortStream = null;
          const sid = this.sessionId;
          this._onSessionsChanged();
          if (sid) {
            this.scrollToBottomOnLoad = true;
            this.reloadSession(sid, true);
          }
        });
      },
    });

    this.abortStream = abort;
  }

  cancelSend(): string | null {
    if (this.abortStream) {
      const message = this.pendingUserMessage;
      this.abortStream();
      this.abortStream = null;
      this.sending = false;
      this.streamingText = '';
      this.streamingToolCalls = [];
      this.streamingBlocks = [];
      this.committedStreamingMessages = [];
      return message;
    }
    return null;
  }

  async tryReconnectToStream(sessionId: string) {
    try {
      const status = await fetchSessionStatus(sessionId);
      if (!status.streaming) return;

      runInAction(() => {
        this.sending = true;
        this.streamingText = '';
        this.streamingToolCalls = [];
        this.streamingBlocks = [];
        this.committedStreamingMessages = [];
        this.clearRawLines();
        this.showReconnectionBanner(sessionId);
      });

      const abort = subscribeToSession(sessionId, {
        onText: (text) => { runInAction(() => { this.streamingText += text; }); },
        onRaw: (data) => { runInAction(() => { this.appendRawLine(data); }); },
        onResult: (data) => {
          runInAction(() => {
            if (data.result && this.committedStreamingMessages.length === 0) {
              this.streamingText = data.result;
            }
          });
        },
        onError: (error) => {
          runInAction(() => {
            this.error = error;
            this.sending = false;
          });
        },
        onDone: () => {
          runInAction(() => {
            this.sending = false;
            this.abortStream = null;
            this.scrollToBottomOnLoad = true;
            this.reloadSession(sessionId, true);
          });
        },
      });

      runInAction(() => { this.abortStream = abort; });
    } catch {
      // Status check failed — skip reconnect
    }
  }

  clearForkResult() {
    this.forkResult = null;
  }

  private showReconnectionBanner(sessionId: string) {
    this.reconnectedSessionId = sessionId;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this.reconnectedSessionId = null;
    }, 5000);
  }
}
