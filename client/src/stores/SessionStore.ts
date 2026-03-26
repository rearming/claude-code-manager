import { makeAutoObservable, runInAction } from 'mobx';
import type { SessionSummary, ImageAttachment } from '../types';
import { fetchSessions } from '../api';
import { TabSession } from './TabSession';

// Re-export for components that import from here
export type { StreamingToolCall, StreamingBlock } from './TabSession';
export { TabSession } from './TabSession';

const SETTINGS_KEY = 'ccm-settings';
const SCROLL_POSITIONS_KEY = 'ccm-scroll-positions';
const ARCHIVED_SESSIONS_KEY = 'ccm-archived-sessions';
const OPEN_TABS_KEY = 'ccm-open-tabs';

interface PanelLayout {
  sidebarSize: number;
  chatSize: number;
  terminalSize: number;
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

function loadArchivedSessions(): Set<string> {
  try {
    const raw = localStorage.getItem(ARCHIVED_SESSIONS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function loadOpenTabs(): { tabSessionIds: string[]; activeTabId: string | null; minimizedTabIds: string[] } {
  try {
    const raw = sessionStorage.getItem(OPEN_TABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        tabSessionIds: parsed.tabSessionIds || [],
        activeTabId: parsed.activeTabId || null,
        minimizedTabIds: parsed.minimizedTabIds || [],
      };
    }
  } catch { /* ignore */ }
  return { tabSessionIds: [], activeTabId: null, minimizedTabIds: [] };
}

export class SessionStore {
  // ── Global state ──────────────────────────────────────────
  sessions: SessionSummary[] = [];
  loading = false;
  error: string | null = null;
  searchQuery = '';
  projectFilter = loadSettings().projectFilter || '';
  sortBy: 'date' | 'messages' | 'project' = 'date';
  settings: Settings = loadSettings();
  scrollPositions: Record<string, { position: number; messageCount: number } | number> = loadScrollPositions();
  showSettings = false;
  archivedSessionIds: Set<string> = loadArchivedSessions();
  showArchived = false;
  showNewSession = false;

  // ── Tab management ────────────────────────────────────────
  tabs: TabSession[] = [];
  activeTabId: string | null = null;
  minimizedTabIds: Set<string> = new Set();

  constructor() {
    makeAutoObservable(this);
  }

  // ── Computed: backward-compat / convenience ───────────────

  get activeTab(): TabSession | null {
    return this.tabs.find(t => t.tabId === this.activeTabId) || null;
  }

  get visibleTabs(): TabSession[] {
    return this.tabs.filter(t => !this.minimizedTabIds.has(t.tabId));
  }

  get minimizedTabs(): TabSession[] {
    return this.tabs.filter(t => this.minimizedTabIds.has(t.tabId));
  }

  /** Backward compat: the active tab's sessionId */
  get selectedSessionId(): string | null {
    return this.activeTab?.sessionId || null;
  }

  /** Backward compat: the active tab's detail */
  get selectedDetail() {
    return this.activeTab?.selectedDetail || null;
  }

  /** Which sessions are currently streaming (across all tabs) */
  get streamingSessionIds(): Set<string> {
    const ids = new Set<string>();
    for (const tab of this.tabs) {
      if (tab.sending && tab.sessionId) ids.add(tab.sessionId);
    }
    return ids;
  }

  /** Backward compat */
  get streamingSessionId(): string | null {
    const active = this.activeTab;
    if (active?.sending) return active.sessionId;
    return null;
  }

  // ── Tab operations ────────────────────────────────────────

  private createTab(sessionId: string | null): TabSession {
    return new TabSession(
      sessionId,
      () => this.loadSessions(),
      () => this.settings.dangerouslySkipPermissions,
    );
  }

  /** Open a session in a tab. If already open, activate it. */
  openTab(sessionId: string) {
    const existing = this.tabs.find(t => t.sessionId === sessionId);
    if (existing) {
      this.activateTab(existing.tabId);
      return existing;
    }
    const tab = this.createTab(sessionId);
    this.tabs.push(tab);
    this.activeTabId = tab.tabId;
    this.minimizedTabIds.delete(tab.tabId);
    this.persistTabs();
    tab.loadDetail(sessionId);
    return tab;
  }

  /** Open a new-session tab (sessionId unknown until stream starts) */
  openNewSessionTab(message: string, projectPath: string, images?: ImageAttachment[]) {
    const tab = this.createTab(null);
    this.tabs.push(tab);
    this.activeTabId = tab.tabId;
    this.persistTabs();
    tab.startNewSession(message, projectPath, images);
    return tab;
  }

  activateTab(tabId: string) {
    this.activeTabId = tabId;
    this.minimizedTabIds.delete(tabId);
    this.persistTabs();
  }

  closeTab(tabId: string) {
    const tab = this.tabs.find(t => t.tabId === tabId);
    if (!tab) return;
    // Cannot close active (streaming) tabs
    if (tab.sending) return;

    tab.cancelSend(); // clean up
    const idx = this.tabs.indexOf(tab);
    this.tabs.splice(idx, 1);
    this.minimizedTabIds.delete(tabId);

    if (this.activeTabId === tabId) {
      // Activate adjacent tab
      const newIdx = Math.min(idx, this.tabs.length - 1);
      this.activeTabId = newIdx >= 0 ? this.tabs[newIdx].tabId : null;
    }
    this.persistTabs();
  }

  minimizeTab(tabId: string) {
    const tab = this.tabs.find(t => t.tabId === tabId);
    if (!tab || tab.sending) return; // Can't minimize active sessions

    this.minimizedTabIds.add(tabId);

    if (this.activeTabId === tabId) {
      // Switch to next visible tab
      const visible = this.visibleTabs;
      this.activeTabId = visible.length > 0 ? visible[0].tabId : null;
    }
    this.persistTabs();
  }

  restoreTab(tabId: string) {
    this.minimizedTabIds.delete(tabId);
    this.activeTabId = tabId;
    this.persistTabs();
  }

  /** Move a tab from one index to another (drag-to-reorder) */
  moveTab(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.tabs.length) return;
    if (toIndex < 0 || toIndex >= this.tabs.length) return;
    const [tab] = this.tabs.splice(fromIndex, 1);
    this.tabs.splice(toIndex, 0, tab);
    this.persistTabs();
  }

  // ── Backward-compat: selectSession opens a tab ────────────

  selectSession(sessionId: string) {
    this.openTab(sessionId);
  }

  clearSelection() {
    if (this.activeTab) {
      this.closeTab(this.activeTab.tabId);
    }
  }

  // ── New session flow ──────────────────────────────────────

  openNewSession() {
    this.showNewSession = true;
  }

  closeNewSession() {
    this.showNewSession = false;
  }

  startNewSession(message: string, projectPath: string, images?: ImageAttachment[]) {
    this.showNewSession = false;
    this.openNewSessionTab(message, projectPath, images);
  }

  // ── Settings / UI ─────────────────────────────────────────

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

  // ── Scroll positions ──────────────────────────────────────

  saveScrollPosition(sessionId: string, position: number, messageCount: number) {
    this.scrollPositions[sessionId] = { position, messageCount };
    this.persistScrollPositions();
  }

  getScrollPosition(sessionId: string): { position: number; messageCount: number } | undefined {
    const saved = this.scrollPositions[sessionId];
    if (saved === undefined) return undefined;
    if (typeof saved === 'number') return { position: saved, messageCount: 0 };
    return saved;
  }

  // ── Session list ──────────────────────────────────────────

  get projects(): string[] {
    const projectSet = new Set(this.sessions.map((s) => s.project));
    return Array.from(projectSet).sort();
  }

  get filteredSessions(): SessionSummary[] {
    let result = this.sessions;

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

  // ── Archive ───────────────────────────────────────────────

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

  // ── Loading ───────────────────────────────────────────────

  async loadSessions() {
    this.loading = true;
    this.error = null;
    try {
      const sessions = await fetchSessions();
      runInAction(() => {
        this.sessions = sessions;
        this.loading = false;
        // Restore tabs on first load
        if (this.tabs.length === 0) {
          this.restoreTabsFromStorage(sessions);
        }
      });
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : 'Unknown error';
        this.loading = false;
      });
    }
  }

  private restoreTabsFromStorage(sessions: SessionSummary[]) {
    const saved = loadOpenTabs();
    for (const sid of saved.tabSessionIds) {
      if (sessions.some(s => s.sessionId === sid)) {
        const existing = this.tabs.find(t => t.sessionId === sid);
        if (!existing) {
          const tab = this.createTab(sid);
          this.tabs.push(tab);
          tab.loadDetail(sid);
          if (saved.minimizedTabIds.includes(sid)) {
            this.minimizedTabIds.add(tab.tabId);
          }
        }
      }
    }
    // Activate saved active tab or first tab
    if (saved.activeTabId && this.tabs.length > 0) {
      const activeTab = this.tabs.find(t => t.sessionId === saved.activeTabId);
      if (activeTab) {
        this.activeTabId = activeTab.tabId;
      } else {
        this.activeTabId = this.tabs[0]?.tabId || null;
      }
    } else if (this.tabs.length > 0) {
      this.activeTabId = this.tabs[0].tabId;
    }
  }

  // ── Persistence ───────────────────────────────────────────

  private persistSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  private persistScrollPositions() {
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(this.scrollPositions));
  }

  private persistArchivedSessions() {
    localStorage.setItem(ARCHIVED_SESSIONS_KEY, JSON.stringify([...this.archivedSessionIds]));
  }

  private persistTabs() {
    const data = {
      tabSessionIds: this.tabs.map(t => t.sessionId).filter(Boolean),
      activeTabId: this.activeTab?.sessionId || null,
      minimizedTabIds: this.minimizedTabs.map(t => t.sessionId).filter(Boolean),
    };
    sessionStorage.setItem(OPEN_TABS_KEY, JSON.stringify(data));
  }
}

export const sessionStore = new SessionStore();
