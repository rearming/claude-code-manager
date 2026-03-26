import { makeAutoObservable, runInAction } from 'mobx';
import type { SessionSummary, SessionDetail, ForkResult, ImageAttachment, ConversationMessage, ToolCallSummary } from '../types';
import { fetchSessions, fetchSessionDetail, resumeSession, forkSessionAt, streamMessageToSession, streamNewSession, fetchSessionStatus, subscribeToSession } from '../api';

const SETTINGS_KEY = 'ccm-settings';
const SCROLL_POSITIONS_KEY = 'ccm-scroll-positions';
const RAW_LINES_KEY = 'ccm-raw-lines';
const TERMINAL_INPUT_KEY = 'ccm-terminal-input';
const SELECTED_SESSION_KEY = 'ccm-selected-session';
const ARCHIVED_SESSIONS_KEY = 'ccm-archived-sessions';

interface PanelLayout {
  sidebarSize: number;    // percentage
  chatSize: number;       // percentage
  terminalSize: number;   // percentage
  sidebarCollapsed: boolean;
  chatCollapsed: boolean;
  terminalCollapsed: boolean;
}

interface Settings {
  autoScrollOnNewMessages: boolean;
  dangerouslySkipPermissions: boolean;
  globalExpandTools: boolean;
  globalShowDiffs: boolean;
  showTerminal: boolean;
  panelLayout: PanelLayout;
  projectFilter: string;
}

const defaultPanelLayout: PanelLayout = {
  sidebarSize: 20,
  chatSize: 50,
  terminalSize: 30,
  sidebarCollapsed: false,
  chatCollapsed: false,
  terminalCollapsed: false,
};

const defaultSettings: Settings = {
  autoScrollOnNewMessages: true,
  dangerouslySkipPermissions: false,
  globalExpandTools: false,
  globalShowDiffs: false,
  showTerminal: false,
  panelLayout: { ...defaultPanelLayout },
  projectFilter: '',
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

function loadScrollPositions(): Record<string, { position: number; messageCount: number } | number> {
  try {
    const raw = localStorage.getItem(SCROLL_POSITIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadRawLines(): string[] {
  try {
    const raw = sessionStorage.getItem(RAW_LINES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadTerminalInput(): string {
  try {
    return sessionStorage.getItem(TERMINAL_INPUT_KEY) || '';
  } catch {
    return '';
  }
}

function loadArchivedSessions(): Set<string> {
  try {
    const raw = localStorage.getItem(ARCHIVED_SESSIONS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

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

export class SessionStore {
  sessions: SessionSummary[] = [];
  selectedDetail: SessionDetail | null = null;
  selectedSessionId: string | null = null;
  searchQuery = '';
  projectFilter = loadSettings().projectFilter || '';
  sortBy: 'date' | 'messages' | 'project' = 'date';
  loading = false;
  detailLoading = false;
  error: string | null = null;
  resumeCommand: string | null = null;
  forkResult: ForkResult | null = null;
  forking = false;
  sending = false;
  streamingText = '';
  abortStream: (() => void) | null = null;
  rawLines: string[] = loadRawLines();
  streamingToolCalls: StreamingToolCall[] = [];
  streamingBlocks: StreamingBlock[] = [];
  /** Completed assistant turns committed during multi-turn streaming */
  committedStreamingMessages: ConversationMessage[] = [];
  terminalInput: string = loadTerminalInput();
  lastRawEventTime: number = 0;
  settings: Settings = loadSettings();
  scrollPositions: Record<string, { position: number; messageCount: number } | number> = loadScrollPositions();
  showSettings = false;
  archivedSessionIds: Set<string> = loadArchivedSessions();
  showArchived = false;

  constructor() {
    makeAutoObservable(this);
  }

  /** Which session is currently streaming (null if none) */
  get streamingSessionId(): string | null {
    if (!this.sending) return null;
    return this.selectedSessionId || this.newSessionId;
  }

  /** Reconnection status for UX feedback */
  reconnectedSessionId: string | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private showReconnectionBanner(sessionId: string) {
    this.reconnectedSessionId = sessionId;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this.reconnectedSessionId = null;
    }, 5000);
  }

  toggleSettings() {
    this.showSettings = !this.showSettings;
  }

  get showTerminal() {
    return this.settings.showTerminal;
  }

  toggleTerminal() {
    this.settings.showTerminal = !this.settings.showTerminal;
    this.persistSettings();
  }

  get panelLayout(): PanelLayout {
    return this.settings.panelLayout || { ...defaultPanelLayout };
  }

  setPanelLayout(sizes: Partial<PanelLayout>) {
    this.settings.panelLayout = { ...this.settings.panelLayout, ...sizes };
    this.persistSettings();
  }

  setSidebarCollapsed(collapsed: boolean) {
    this.setPanelLayout({ sidebarCollapsed: collapsed });
  }

  setChatCollapsed(collapsed: boolean) {
    this.setPanelLayout({ chatCollapsed: collapsed });
  }

  setTerminalCollapsed(collapsed: boolean) {
    this.setPanelLayout({ terminalCollapsed: collapsed });
  }

  appendRawLine(line: string) {
    this.rawLines.push(line);
    // Keep last 1000 lines
    if (this.rawLines.length > 1000) {
      this.rawLines = this.rawLines.slice(-800);
    }
    this.lastRawEventTime = Date.now();
    this.persistRawLines();

    // Parse raw events to extract tool call info for live streaming display
    try {
      const event = JSON.parse(line);
      this.processStreamEvent(event);
    } catch {
      // Not JSON (e.g. stderr lines) — skip
    }
  }

  private processStreamEvent(event: Record<string, unknown>) {
    // content_block_start: detect new text or tool_use blocks
    if (event.type === 'content_block_start') {
      const block = (event as { content_block?: { type: string; id?: string; name?: string }; index?: number }).content_block;
      if (block?.type === 'tool_use' && block.name) {
        const exists = block.id && this.streamingToolCalls.some(tc => tc.id === block.id);
        if (!exists) {
          const toolCall: StreamingToolCall = {
            id: block.id,
            name: block.name,
            input: {},
            status: 'running',
          };
          this.streamingToolCalls.push(toolCall);
          // Add to interleaved blocks
          this.streamingBlocks.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: {},
            status: 'running',
          });
        }
      }
      if (block?.type === 'text') {
        // A new text block starting means previous tool calls are done
        for (const tc of this.streamingToolCalls) {
          if (tc.status === 'running') tc.status = 'done';
        }
        for (const b of this.streamingBlocks) {
          if (b.type === 'tool_use' && b.status === 'running') b.status = 'done';
        }
        // Add a new text block for interleaving
        this.streamingBlocks.push({ type: 'text', text: '' });
      }
    }

    // content_block_delta: accumulate text or tool input
    if (event.type === 'content_block_delta') {
      const delta = (event as { delta?: { type?: string; partial_json?: string; text?: string } }).delta;

      // Text delta → append to latest text block
      if (delta?.type === 'text_delta' && delta.text) {
        const lastText = [...this.streamingBlocks].reverse().find(b => b.type === 'text');
        if (lastText && lastText.type === 'text') {
          lastText.text += delta.text;
        } else {
          // No text block yet (e.g. missed content_block_start) — create one
          this.streamingBlocks.push({ type: 'text', text: delta.text });
        }
      }

      // Tool input delta → accumulate partial JSON
      if (delta?.type === 'input_json_delta' && delta.partial_json) {
        const lastRunning = [...this.streamingToolCalls].reverse().find(tc => tc.status === 'running');
        if (lastRunning) {
          const raw = (lastRunning._rawInput || '') + delta.partial_json;
          lastRunning._rawInput = raw;
          try {
            lastRunning.input = JSON.parse(raw);
          } catch {
            // Incomplete JSON, wait for more deltas
          }
        }
        // Also update in streamingBlocks
        const lastToolBlock = [...this.streamingBlocks].reverse().find(b => b.type === 'tool_use' && b.status === 'running');
        if (lastToolBlock && lastToolBlock.type === 'tool_use') {
          const raw = (lastToolBlock._rawInput || '') + delta.partial_json;
          lastToolBlock._rawInput = raw;
          try {
            lastToolBlock.input = JSON.parse(raw);
          } catch {
            // Incomplete JSON
          }
        }
      }
    }

    // assistant event: a complete assistant turn has arrived.
    // Commit it as a proper message and reset streaming state for the next turn.
    if (event.type === 'assistant') {
      const msg = event.message as {
        content?: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }>;
        model?: string;
      } | undefined;
      if (msg?.content && Array.isArray(msg.content)) {
        const textParts: string[] = [];
        const toolCalls: ToolCallSummary[] = [];

        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            textParts.push(block.text);
          }
          if (block.type === 'tool_use' && block.name) {
            toolCalls.push({
              name: block.name,
              input: typeof block.input === 'string'
                ? { raw: block.input }
                : (block.input || {}),
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

        // Clear streaming state so the next turn starts fresh
        this.streamingText = '';
        this.streamingBlocks = [];
        this.streamingToolCalls = [];
      }
    }

    // result event: mark all remaining running tool calls as done
    if (event.type === 'result') {
      for (const tc of this.streamingToolCalls) {
        if (tc.status === 'running') tc.status = 'done';
      }
      for (const b of this.streamingBlocks) {
        if (b.type === 'tool_use' && b.status === 'running') b.status = 'done';
      }
    }
  }

  clearRawLines() {
    this.rawLines = [];
    // Persist immediately on clear (bypass debounce)
    if (this._rawLinesPersistTimer) clearTimeout(this._rawLinesPersistTimer);
    sessionStorage.setItem(RAW_LINES_KEY, '[]');
  }

  setTerminalInput(value: string) {
    this.terminalInput = value;
    sessionStorage.setItem(TERMINAL_INPUT_KEY, value);
  }

  setAutoScroll(value: boolean) {
    this.settings.autoScrollOnNewMessages = value;
    this.persistSettings();
  }

  setDangerouslySkipPermissions(value: boolean) {
    this.settings.dangerouslySkipPermissions = value;
    this.persistSettings();
  }

  toggleGlobalExpandTools() {
    this.settings.globalExpandTools = !this.settings.globalExpandTools;
    this.persistSettings();
  }

  toggleGlobalShowDiffs() {
    this.settings.globalShowDiffs = !this.settings.globalShowDiffs;
    this.persistSettings();
  }

  saveScrollPosition(sessionId: string, position: number, messageCount: number) {
    this.scrollPositions[sessionId] = { position, messageCount };
    this.persistScrollPositions();
  }

  getScrollPosition(sessionId: string): { position: number; messageCount: number } | undefined {
    const saved = this.scrollPositions[sessionId];
    if (saved === undefined) return undefined;
    // Backwards compat: old format stored just a number
    if (typeof saved === 'number') return { position: saved, messageCount: 0 };
    return saved;
  }

  private persistSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  private persistScrollPositions() {
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(this.scrollPositions));
  }

  private _rawLinesPersistTimer: ReturnType<typeof setTimeout> | null = null;

  private persistRawLines() {
    // Debounce writes during rapid streaming
    if (this._rawLinesPersistTimer) clearTimeout(this._rawLinesPersistTimer);
    this._rawLinesPersistTimer = setTimeout(() => {
      try {
        sessionStorage.setItem(RAW_LINES_KEY, JSON.stringify(this.rawLines));
      } catch {
        // sessionStorage full — silently ignore
      }
    }, 500);
  }

  get projects(): string[] {
    const projectSet = new Set(this.sessions.map((s) => s.project));
    return Array.from(projectSet).sort();
  }

  get filteredSessions(): SessionSummary[] {
    let result = this.sessions;

    // Filter by archive status
    if (this.showArchived) {
      result = result.filter((s) => this.archivedSessionIds.has(s.sessionId));
    } else {
      result = result.filter((s) => !this.archivedSessionIds.has(s.sessionId));
    }

    if (this.projectFilter) {
      result = result.filter((s) => s.project === this.projectFilter);
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.firstMessage.toLowerCase().includes(q) ||
          (s.slug && s.slug.toLowerCase().includes(q)) ||
          s.sessionId.includes(q)
      );
    }

    switch (this.sortBy) {
      case 'date':
        result = [...result].sort((a, b) => b.lastTimestamp - a.lastTimestamp);
        break;
      case 'messages':
        result = [...result].sort((a, b) => b.messageCount - a.messageCount);
        break;
      case 'project':
        result = [...result].sort((a, b) => a.project.localeCompare(b.project));
        break;
    }

    return result;
  }

  get groupedSessions(): Map<string, SessionSummary[]> {
    const groups = new Map<string, SessionSummary[]>();
    for (const session of this.filteredSessions) {
      const key = session.project;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(session);
    }
    return groups;
  }

  setSearchQuery(query: string) {
    this.searchQuery = query;
  }

  setProjectFilter(project: string) {
    this.projectFilter = project;
    this.settings.projectFilter = project;
    this.persistSettings();
  }

  setSortBy(sort: 'date' | 'messages' | 'project') {
    this.sortBy = sort;
  }

  toggleShowArchived() {
    this.showArchived = !this.showArchived;
  }

  archiveSession(sessionId: string) {
    this.archivedSessionIds.add(sessionId);
    this.persistArchivedSessions();
  }

  unarchiveSession(sessionId: string) {
    this.archivedSessionIds.delete(sessionId);
    this.persistArchivedSessions();
  }

  isArchived(sessionId: string): boolean {
    return this.archivedSessionIds.has(sessionId);
  }

  private persistArchivedSessions() {
    localStorage.setItem(ARCHIVED_SESSIONS_KEY, JSON.stringify([...this.archivedSessionIds]));
  }

  async loadSessions() {
    this.loading = true;
    this.error = null;
    try {
      const sessions = await fetchSessions();
      runInAction(() => {
        this.sessions = sessions;
        this.loading = false;
        // Restore previously selected session
        if (!this.selectedSessionId && !this.sending) {
          const saved = sessionStorage.getItem(SELECTED_SESSION_KEY);
          if (saved && sessions.some(s => s.sessionId === saved)) {
            this.selectSession(saved);
          }
        }
      });
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : 'Unknown error';
        this.loading = false;
      });
    }
  }

  async selectSession(sessionId: string) {
    this.selectedSessionId = sessionId;
    this.persistSelectedSession();
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
      // Check if this session is actively streaming and reconnect
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

  /**
   * Reload a session without clearing streamingText until the data arrives.
   * This prevents the UI from going blank between stream end and data load.
   */
  /**
   * Reload session detail from the JSONL file.
   * When retryForNewMessages is true, retries if the JSONL hasn't been updated
   * yet (race condition: Claude CLI may not have flushed writes when the
   * stream-json result event fires).
   */
  async reloadSession(sessionId: string, retryForNewMessages = false) {
    this.selectedSessionId = sessionId;
    const previousCount = this.selectedDetail?.messages?.length || 0;

    const MAX_ATTEMPTS = retryForNewMessages ? 6 : 1;
    const INITIAL_DELAY = 400;
    const RETRY_DELAY = 800;

    if (retryForNewMessages) {
      // Wait a bit for Claude CLI to flush JSONL writes
      await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const detail = await fetchSessionDetail(sessionId);

        // If we expect new messages and the JSONL hasn't caught up, retry
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
        // For retry mode, keep trying on errors too (JSONL might not exist yet for new sessions)
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

  async resume(sessionId: string) {
    try {
      const result = await resumeSession(sessionId);
      runInAction(() => {
        this.resumeCommand = result.command;
      });
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : 'Unknown error';
      });
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
        this.loadSessions();
      });
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : 'Fork failed';
        this.forking = false;
      });
    }
  }

  pendingUserMessage: string | null = null;
  pendingImages: ImageAttachment[] | null = null;
  scrollToBottomOnLoad = false;
  showNewSession = false;
  newSessionId: string | null = null;

  openNewSession() {
    this.showNewSession = true;
  }

  closeNewSession() {
    this.showNewSession = false;
  }

  startNewSession(message: string, projectPath: string, images?: ImageAttachment[]) {
    this.showNewSession = false;
    this.sending = true;
    this.streamingText = '';
    this.pendingUserMessage = message;
    this.pendingImages = images || null;
    this.newSessionId = null;
    this.error = null;

    // Clear current selection to show the "new session" streaming view
    this.selectedSessionId = null;
    this.selectedDetail = null;

    this.clearRawLines();
    this.streamingToolCalls = [];
    this.streamingBlocks = [];
    this.committedStreamingMessages = [];
    const abort = streamNewSession(message, projectPath, this.settings.dangerouslySkipPermissions, {
      images: images,
      onInit: (data) => {
        runInAction(() => {
          this.newSessionId = data.sessionId;
        });
      },
      onText: (text) => {
        runInAction(() => {
          this.streamingText += text;
        });
      },
      onRaw: (data) => {
        runInAction(() => {
          this.appendRawLine(data);
        });
      },
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
          const sid = this.newSessionId;
          this.newSessionId = null;
          this.loadSessions();
          if (sid) {
            this.scrollToBottomOnLoad = true;
            this.reloadSession(sid, true);
          }
        });
      },
    });

    this.abortStream = abort;
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

    const abort = streamMessageToSession(sessionId, message, this.settings.dangerouslySkipPermissions, {
      images: images,
      onText: (text) => {
        runInAction(() => {
          this.streamingText += text;
        });
      },
      onRaw: (data) => {
        runInAction(() => {
          this.appendRawLine(data);
        });
      },
      onResult: (data) => {
        runInAction(() => {
          // Use the full result text to ensure nothing is missed,
          // but only if we haven't committed turns (otherwise the text is already committed)
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
          // Keep streamingText/committedMessages visible until reload completes;
          // retry if JSONL hasn't been flushed yet
          this.reloadSession(sessionId, true);
        });
      },
    });

    this.abortStream = abort;
  }

  cancelSend() {
    if (this.abortStream) {
      this.abortStream();
      this.abortStream = null;
      this.sending = false;
      this.streamingText = '';
      this.streamingToolCalls = [];
      this.streamingBlocks = [];
      this.committedStreamingMessages = [];
    }
  }

  /**
   * Check if a session is actively streaming on the server and reconnect if so.
   * Called after page reload when restoring a selected session.
   */
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
        onText: (text) => {
          runInAction(() => {
            this.streamingText += text;
          });
        },
        onRaw: (data) => {
          runInAction(() => {
            this.appendRawLine(data);
          });
        },
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

      runInAction(() => {
        this.abortStream = abort;
      });
    } catch {
      // Status check failed — not critical, just skip reconnect
    }
  }

  clearForkResult() {
    this.forkResult = null;
  }

  clearSelection() {
    this.cancelSend();
    this.selectedSessionId = null;
    this.persistSelectedSession();
    this.selectedDetail = null;
    this.resumeCommand = null;
    this.forkResult = null;
  }

  private persistSelectedSession() {
    if (this.selectedSessionId) {
      sessionStorage.setItem(SELECTED_SESSION_KEY, this.selectedSessionId);
    } else {
      sessionStorage.removeItem(SELECTED_SESSION_KEY);
    }
  }
}

export const sessionStore = new SessionStore();
