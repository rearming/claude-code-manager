import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { X, FolderOpen, FileText, ChevronDown, ChevronRight, Trash2, Send } from 'lucide-react';
import { Button } from '@/components/shadcn/ui/button';
import { Input } from '@/components/shadcn/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/ui/select';
import { ChatInput } from './ChatInput';
import type { SessionStore } from '../stores/SessionStore';
import { draftStore } from '../stores/DraftStore';
import type { ImageAttachment, Draft } from '../types';
import { pickDirectory } from '../api';

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

interface Props {
  store: SessionStore;
}

export const NewSessionDialog = observer(({ store }: Props) => {
  const [message, setMessage] = useState(() => localStorage.getItem('ccm-new-session-message') || '');
  const [projectPath, setProjectPath] = useState(() => localStorage.getItem('ccm-last-project-dir') || '');
  const [draftName, setDraftName] = useState('');
  const [picking, setPicking] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [draftsExpanded, setDraftsExpanded] = useState(() => {
    try { return localStorage.getItem('ccm-new-session-drafts-expanded') !== 'false'; } catch { return true; }
  });

  // Load draft when store signals one
  useEffect(() => {
    if (store.showNewSession && store.pendingDraftId) {
      const draft = draftStore.getDraft(store.pendingDraftId);
      if (draft) {
        loadDraftIntoForm(draft);
      }
      store.clearPendingDraft();
    }
  }, [store.showNewSession, store.pendingDraftId, store]);

  const loadDraftIntoForm = (draft: Draft) => {
    setMessage(draft.message);
    setProjectPath(draft.projectPath);
    setDraftName(draft.name || '');
    setEditingDraftId(draft.id);
    localStorage.setItem('ccm-new-session-message', draft.message);
    localStorage.setItem('ccm-last-project-dir', draft.projectPath);
  };

  const updateMessage = (val: string) => {
    setMessage(val);
    localStorage.setItem('ccm-new-session-message', val);
  };
  const updateProjectPath = (val: string) => {
    setProjectPath(val);
    localStorage.setItem('ccm-last-project-dir', val);
  };

  if (!store.showNewSession) return null;

  const projectPaths = [...new Set(store.sessions.map((s) => s.project))].sort();

  const handleSubmit = (text: string, images?: ImageAttachment[]) => {
    const trimmedPath = projectPath.trim();
    if (!text || !trimmedPath) return;
    if (editingDraftId) {
      draftStore.deleteDraft(editingDraftId);
      setEditingDraftId(null);
    }
    setDraftName('');
    localStorage.removeItem('ccm-new-session-message');
    setMessage('');
    store.startNewSession(text, trimmedPath, images);
  };

  const handleSaveDraft = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    if (editingDraftId) {
      draftStore.updateDraft(editingDraftId, {
        name: draftName,
        message: trimmed,
        projectPath: projectPath.trim(),
      });
    } else {
      const draft = draftStore.saveDraft(trimmed, projectPath.trim(), [], draftName);
      setEditingDraftId(draft.id);
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const isDirty = (): boolean => {
    if (!editingDraftId) return false;
    const draft = draftStore.getDraft(editingDraftId);
    if (!draft) return false;
    return draft.message !== message.trim()
      || draft.projectPath !== projectPath.trim()
      || (draft.name || '') !== draftName.trim();
  };

  const handleCloseAttempt = () => {
    if (isDirty()) {
      setShowCloseConfirm(true);
      return;
    }
    forceClose();
  };

  const handleUpdateAndClose = () => {
    handleSaveDraft();
    setShowCloseConfirm(false);
    forceClose();
  };

  const handleDiscardAndClose = () => {
    setShowCloseConfirm(false);
    forceClose();
  };

  const forceClose = () => {
    setEditingDraftId(null);
    setDraftName('');
    store.closeNewSession();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showCloseConfirm) {
        setShowCloseConfirm(false);
      } else {
        handleCloseAttempt();
      }
    }
  };

  const handlePickDirectory = async () => {
    setPicking(true);
    try {
      const selected = await pickDirectory(projectPath || undefined);
      if (selected) {
        updateProjectPath(selected);
      }
    } catch {
      // silently ignore
    } finally {
      setPicking(false);
    }
  };

  const toggleDraftsExpanded = () => {
    const next = !draftsExpanded;
    setDraftsExpanded(next);
    localStorage.setItem('ccm-new-session-drafts-expanded', String(next));
  };

  const canSaveDraft = message.trim().length > 0;
  const draftCount = draftStore.count;
  const grouped = draftStore.groupedByProject;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={handleCloseAttempt}>
      <div
        className="w-full max-w-2xl bg-background border border-border p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-zinc-200">
              {editingDraftId ? 'edit draft' : 'new session'}
            </h3>
            {editingDraftId && (
              <span className="text-xs text-zinc-500 border border-zinc-700 px-1.5 py-0.5">draft</span>
            )}
          </div>
          <Button size="icon" variant="ghost" onClick={handleCloseAttempt}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-zinc-500 uppercase tracking-wide">project directory</label>
          <div className="flex gap-2">
            {projectPaths.length > 0 && (
              <Select
                value={projectPath || '__none__'}
                onValueChange={(val) => updateProjectPath(val === '__none__' ? '' : val)}
              >
                <SelectTrigger className="w-[200px] shrink-0 h-9 bg-black/50 text-sm text-zinc-300">
                  <SelectValue placeholder="recent..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">recent projects...</SelectItem>
                  {projectPaths.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              type="text"
              placeholder="/path/to/project"
              value={projectPath}
              onChange={(e) => updateProjectPath(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-black/50 flex-1"
            />
            <Button
              size="icon"
              variant="outline"
              className="shrink-0"
              onClick={handlePickDirectory}
              disabled={picking}
              type="button"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          {!projectPath.trim() && (
            <p className="text-xs text-zinc-600">no project selected — draft will be saved as freeform</p>
          )}
        </div>

        <ChatInput
          value={message}
          onChange={updateMessage}
          onSubmit={handleSubmit}
          disabled={!projectPath.trim()}
          projectPath={projectPath.trim() || undefined}
          placeholder="what would you like to work on? (paste/drop images)"
          submitLabel="start session"
          rows={4}
          onKeyDown={handleKeyDown}
        />

        <div className="flex items-center gap-2 pt-1">
          <Input
            type="text"
            placeholder="draft name (optional)"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="bg-black/50 h-8 text-xs flex-1 max-w-[240px]"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={!canSaveDraft}
            className={savedFlash ? 'border-green-700 text-green-400' : ''}
          >
            <FileText className="h-3.5 w-3.5 mr-1" />
            {savedFlash ? 'saved!' : editingDraftId ? 'update draft' : 'save as draft'}
          </Button>
          {editingDraftId && (
            <button
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              onClick={() => {
                setEditingDraftId(null);
                setDraftName('');
                setMessage('');
                updateMessage('');
              }}
            >
              clear & start fresh
            </button>
          )}
        </div>

        {/* Inline draft list */}
        {draftCount > 0 && (
          <div className="border border-zinc-700 bg-black/40">
            <button
              className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
              onClick={toggleDraftsExpanded}
            >
              {draftsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <FileText className="h-3 w-3" />
              <span className="uppercase tracking-wide font-bold">drafts</span>
              <span className="text-zinc-600 font-normal">({draftCount})</span>
            </button>

            {draftsExpanded && (
              <div className="max-h-[200px] overflow-y-auto border-t border-zinc-800">
                {Array.from(grouped.entries()).map(([project, drafts]) => (
                  <div key={project || '__freeform__'}>
                    <div className="px-3 py-1 text-[10px] text-zinc-600 uppercase tracking-wider bg-black/30 border-b border-zinc-800/50">
                      {project || 'freeform'}
                    </div>
                    {drafts.map((draft) => (
                      <DraftListItem
                        key={draft.id}
                        draft={draft}
                        isActive={editingDraftId === draft.id}
                        onLoad={() => loadDraftIntoForm(draft)}
                        onSend={() => {
                          if (!draft.projectPath) {
                            // Load into form so user can assign project
                            loadDraftIntoForm(draft);
                            return;
                          }
                          store.startNewSession(draft.message, draft.projectPath, draft.images.length > 0 ? draft.images : undefined);
                          draftStore.deleteDraft(draft.id);
                        }}
                        onDelete={() => {
                          draftStore.deleteDraft(draft.id);
                          if (editingDraftId === draft.id) {
                            setEditingDraftId(null);
                            setDraftName('');
                          }
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showCloseConfirm && (
          <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center" onClick={() => setShowCloseConfirm(false)}>
            <div className="bg-zinc-900 border border-zinc-600 p-5 space-y-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <h4 className="text-sm font-bold text-zinc-200">unsaved changes</h4>
              <p className="text-xs text-zinc-400">you have unsaved changes to this draft. would you like to update it before closing?</p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleDiscardAndClose}>
                  discard
                </Button>
                <Button variant="outline" size="sm" className="border-green-800 text-green-400 hover:bg-green-900/30" onClick={handleUpdateAndClose}>
                  update
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

interface DraftListItemProps {
  draft: Draft;
  isActive: boolean;
  onLoad: () => void;
  onSend: () => void;
  onDelete: () => void;
}

function DraftListItem({ draft, isActive, onLoad, onSend, onDelete }: DraftListItemProps) {
  const displayName = draft.name || truncate(draft.message.split('\n')[0], 60);
  const isFreeform = !draft.projectPath;

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors cursor-pointer ${
        isActive ? 'bg-zinc-800/60 border-l-2 border-l-zinc-400' : ''
      }`}
      onClick={onLoad}
    >
      <FileText className="h-3 w-3 text-zinc-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-zinc-300 truncate block">{displayName}</span>
      </div>
      {isFreeform && (
        <span className="text-[10px] text-zinc-600 shrink-0">freeform</span>
      )}
      <span className="text-[10px] text-zinc-600 shrink-0">{formatDate(draft.updatedAt)}</span>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-0.5 text-zinc-600 hover:text-green-400 transition-colors"
          onClick={(e) => { e.stopPropagation(); onSend(); }}
          title={isFreeform ? 'load & assign project' : 'start session'}
        >
          <Send className="h-3 w-3" />
        </button>
        <button
          className="p-0.5 text-zinc-600 hover:text-red-400 transition-colors"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="delete draft"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
