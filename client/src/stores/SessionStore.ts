import { makeAutoObservable, runInAction } from 'mobx';
import type { SessionSummary, SessionDetail, ForkResult, ImageAttachment } from '../types';
import { fetchSessions, fetchSessionDetail, resumeSession, forkSessionAt, streamMessageToSession, streamNewSession } from '../api';

const SETTINGS_KEY = 'ccm-settings';
const SCROLL_POSITIONS_KEY = 'ccm-scroll-positions';
const RAW_LINES_KEY = 'ccm-raw-lines';
const TERMINAL_INPUT_KEY = 'ccm-terminal-input';

interface Settings {
  autoScrollOnNewMessages: boolean;
  dangerouslySkipPermissions: boolean;
  globalExpandTools: boolean;
  globalShowDiffs: boolean;
  showTerminal: boolean;
}

const defaultSettings: Settings = {
  autoScrollOnNewMessages: true,
  dangerouslySkipPermissions: false,
  globalExpandTools: false,
  globalShowDiffs: false,
  showTerminal: false,
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

export interface StreamingToolCall {
  id?: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'done';
}

export class SessionStore {
  sessions: SessionSummary[] = [];
  selectedDetail: SessionDetail | null = null;
  selectedSessionId: string | null = null;
  searchQuery = '';
  projectFilter = '';
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
  terminalInput: string = loadTerminalInput();
  lastRawEventTime: number = 0;
  settings: Settings = loadSettings();
  scrollPositions: Record<string, { position: number; messageCount: number } | number> = loadScrollPositions();
  showSettings = false;

  constructor() {
    makeAutoObservable(this);
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
    // content_block_start: primary source for tool call detection during streaming
    if (event.type === 'content_block_start') {
      const block = (event as { content_block?: { type: string; id?: string; name?: string }; index?: number }).content_block;
      if (block?.type === 'tool_use' && block.name) {
        const exists = block.id && this.streamingToolCalls.some(tc => tc.id === block.id);
        if (!exists) {
          this.streamingToolCalls.push({
            id: block.id,
            name: block.name,
            input: {},
            status: 'running',
          });
        }
      }
      // Track the current block index for matching deltas
      if (block?.type === 'text') {
        // A new text block starting means previous tool calls are done
        for (const tc of this.streamingToolCalls) {
          if (tc.status === 'running') tc.status = 'done';
        }
      }
    }

    // content_block_delta: accumulate tool input JSON as it streams in
    if (event.type === 'content_block_delta') {
      const delta = (event as { delta?: { type?: string; partial_json?: string } }).delta;
      if (delta?.type === 'input_json_delta' && delta.partial_json) {
        // Find the last running tool call and append to its raw input
        const lastRunning = [...this.streamingToolCalls].reverse().find(tc => tc.status === 'running');
        if (lastRunning) {
          // Accumulate partial JSON; parse when complete
          const raw = ((lastRunning as any)._rawInput || '') + delta.partial_json;
          (lastRunning as any)._rawInput = raw;
          try {
            lastRunning.input = JSON.parse(raw);
          } catch {
            // Incomplete JSON, wait for more deltas
          }
        }
      }
    }

    // content_block_stop: mark tool calls when their block ends
    if (event.type === 'content_block_stop') {
      // The stopped block's tool call input is now complete
      // (input was accumulated via content_block_delta)
    }

    // assistant event: fallback for when assistant events arrive on stdout
    // (may not happen in stream-json mode, but handle for robustness)
    if (event.type === 'assistant') {
      const msg = event.message as { content?: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }> } | undefined;
      if (msg?.content && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use' && block.name) {
            const existing = block.id ? this.streamingToolCalls.find(tc => tc.id === block.id) : undefined;
            if (existing) {
              // Update input from the complete assistant event
              if (block.input && Object.keys(block.input).length > 0) {
                existing.input = block.input;
              }
            } else {
              this.streamingToolCalls.push({
                id: block.id,
                name: block.name,
                input: block.input || {},
                status: 'running',
              });
            }
          }
        }
      }
    }

    // result event: mark all remaining running tool calls as done
    if (event.type === 'result') {
      for (const tc of this.streamingToolCalls) {
        if (tc.status === 'running') tc.status = 'done';
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
    const projectSet = new Set(this.sessions.map((s) => s.projectName));
    return Array.from(projectSet).sort();
  }

  get filteredSessions(): SessionSummary[] {
    let result = this.sessions;

    if (this.projectFilter) {
      result = result.filter((s) => s.projectName === this.projectFilter);
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
        result = [...result].sort((a, b) => a.projectName.localeCompare(b.projectName));
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
  }

  setSortBy(sort: 'date' | 'messages' | 'project') {
    this.sortBy = sort;
  }

  async loadSessions() {
    this.loading = true;
    this.error = null;
    try {
      const sessions = await fetchSessions();
      runInAction(() => {
        this.sessions = sessions;
        this.loading = false;
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
    this.selectedDetail = null;
    this.detailLoading = true;
    this.resumeCommand = null;
    this.streamingText = '';
    try {
      const detail = await fetchSessionDetail(sessionId);
      runInAction(() => {
        this.selectedDetail = detail;
        this.detailLoading = false;
      });
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
  async reloadSession(sessionId: string) {
    this.selectedSessionId = sessionId;
    try {
      const detail = await fetchSessionDetail(sessionId);
      runInAction(() => {
        this.selectedDetail = detail;
        this.streamingText = '';
        this.detailLoading = false;
      });
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : 'Unknown error';
        this.streamingText = '';
        this.detailLoading = false;
      });
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
          if (data.result) {
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
            this.reloadSession(sid);
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
          // Use the full result text to ensure nothing is missed
          if (data.result) {
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
          // Keep streamingText visible until reload completes
          this.reloadSession(sessionId);
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
    }
  }

  clearForkResult() {
    this.forkResult = null;
  }

  clearSelection() {
    this.cancelSend();
    this.selectedSessionId = null;
    this.selectedDetail = null;
    this.resumeCommand = null;
    this.forkResult = null;
  }
}

export const sessionStore = new SessionStore();
