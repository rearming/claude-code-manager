import { makeAutoObservable, runInAction } from 'mobx';
import type { SessionSummary, SessionDetail } from '../types';
import { fetchSessions, fetchSessionDetail, resumeSession } from '../api';

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

  constructor() {
    makeAutoObservable(this);
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

  clearSelection() {
    this.selectedSessionId = null;
    this.selectedDetail = null;
    this.resumeCommand = null;
  }
}

export const sessionStore = new SessionStore();
