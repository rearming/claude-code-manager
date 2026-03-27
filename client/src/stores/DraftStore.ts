import { makeAutoObservable } from 'mobx';
import type { Draft, ImageAttachment } from '../types';

const DRAFTS_KEY = 'ccm-drafts';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export class DraftStore {
  drafts: Draft[] = loadDrafts();

  constructor() {
    makeAutoObservable(this);
  }

  // ── Computed ────────────────────────────────────────────

  /** Drafts grouped by project path. Freeform drafts use '' as key. */
  get groupedByProject(): Map<string, Draft[]> {
    const groups = new Map<string, Draft[]>();
    const sorted = [...this.drafts].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const draft of sorted) {
      const key = draft.projectPath || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(draft);
    }
    return groups;
  }

  get count(): number {
    return this.drafts.length;
  }

  // ── Actions ─────────────────────────────────────────────

  saveDraft(message: string, projectPath: string, images: ImageAttachment[] = []): Draft {
    const now = Date.now();
    const draft: Draft = {
      id: generateId(),
      message,
      projectPath: projectPath.trim(),
      images,
      createdAt: now,
      updatedAt: now,
    };
    this.drafts.push(draft);
    this.persist();
    return draft;
  }

  updateDraft(id: string, updates: Partial<Pick<Draft, 'message' | 'projectPath' | 'images'>>) {
    const draft = this.drafts.find(d => d.id === id);
    if (!draft) return;
    if (updates.message !== undefined) draft.message = updates.message;
    if (updates.projectPath !== undefined) draft.projectPath = updates.projectPath.trim();
    if (updates.images !== undefined) draft.images = updates.images;
    draft.updatedAt = Date.now();
    this.persist();
  }

  deleteDraft(id: string) {
    const idx = this.drafts.findIndex(d => d.id === id);
    if (idx >= 0) {
      this.drafts.splice(idx, 1);
      this.persist();
    }
  }

  getDraft(id: string): Draft | undefined {
    return this.drafts.find(d => d.id === id);
  }

  // ── Persistence ─────────────────────────────────────────

  private persist() {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(this.drafts));
  }
}

export const draftStore = new DraftStore();
