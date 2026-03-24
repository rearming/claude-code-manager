import { makeAutoObservable, runInAction } from 'mobx';
import type { SessionSummary, SessionDetail, ForkResult } from '../types';
import { fetchSessions, fetchSessionDetail, resumeSession, forkSessionAt, streamMessageToSession, streamNewSession } from '../api';

const SETTINGS_KEY = 'ccm-settings';
const SCROLL_POSITIONS_KEY = 'ccm-scroll-positions';

interface Settings {
  autoScrollOnNewMessages: boolean;
  dangerouslySkipPermissions: boolean;
  globalExpandTools: boolean;
  globalShowDiffs: boolean;
}

const defaultSettings: Settings = {
  autoScrollOnNewMessages: true,
  dangerouslySkipPermissions: false,
  globalExpandTools: false,
  globalShowDiffs: false,
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
  showTerminal = false;
  rawLines: string[] = [];
  settings: Settings = loadSettings();
  scrollPositions: Record<string, { position: number; messageCount: number } | number> = loadScrollPositions();
  showSettings = false;

  constructor() {
    makeAutoObservable(this);
  }

  toggleSettings() {
    this.showSettings = !this.showSettings;
  }

  toggleTerminal() {
    this.showTerminal = !this.showTerminal;
  }

  appendRawLine(line: string) {
    this.rawLines.push(line);
    // Keep last 1000 lines
    if (this.rawLines.length > 1000) {
      this.rawLines = this.rawLines.slice(-800);
    }
  }

  clearRawLines() {
    this.rawLines = [];
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
  scrollToBottomOnLoad = false;
  showNewSession = false;
  newSessionId: string | null = null;

  openNewSession() {
    this.showNewSession = true;
  }

  closeNewSession() {
    this.showNewSession = false;
  }

  startNewSession(message: string, projectPath: string) {
    this.showNewSession = false;
    this.sending = true;
    this.streamingText = '';
    this.pendingUserMessage = message;
    this.newSessionId = null;
    this.error = null;

    // Clear current selection to show the "new session" streaming view
    this.selectedSessionId = null;
    this.selectedDetail = null;

    this.rawLines = [];
    const abort = streamNewSession(message, projectPath, this.settings.dangerouslySkipPermissions, {
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
        });
      },
      onDone: () => {
        runInAction(() => {
          this.sending = false;
          this.pendingUserMessage = null;
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

  sendMessage(sessionId: string, message: string) {
    this.sending = true;
    this.streamingText = '';
    this.pendingUserMessage = message;
    this.error = null;
    this.rawLines = [];

    const abort = streamMessageToSession(sessionId, message, this.settings.dangerouslySkipPermissions, {
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
        });
      },
      onDone: () => {
        runInAction(() => {
          this.sending = false;
          this.pendingUserMessage = null;
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
