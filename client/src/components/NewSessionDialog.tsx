import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { X, FolderOpen, FileText } from 'lucide-react';
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
import type { ImageAttachment } from '../types';
import { pickDirectory } from '../api';

interface Props {
  store: SessionStore;
}

export const NewSessionDialog = observer(({ store }: Props) => {
  const [message, setMessage] = useState(() => localStorage.getItem('ccm-new-session-message') || '');
  const [projectPath, setProjectPath] = useState(() => localStorage.getItem('ccm-last-project-dir') || '');
  const [picking, setPicking] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Load draft when store signals one
  useEffect(() => {
    if (store.showNewSession && store.pendingDraftId) {
      const draft = draftStore.getDraft(store.pendingDraftId);
      if (draft) {
        setMessage(draft.message);
        setProjectPath(draft.projectPath);
        setEditingDraftId(draft.id);
        localStorage.setItem('ccm-new-session-message', draft.message);
        localStorage.setItem('ccm-last-project-dir', draft.projectPath);
      }
      store.clearPendingDraft();
    }
  }, [store.showNewSession, store.pendingDraftId, store]);

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
    // If sending a draft, remove it
    if (editingDraftId) {
      draftStore.deleteDraft(editingDraftId);
      setEditingDraftId(null);
    }
    localStorage.removeItem('ccm-new-session-message');
    setMessage('');
    store.startNewSession(text, trimmedPath, images);
  };

  const handleSaveDraft = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    if (editingDraftId) {
      draftStore.updateDraft(editingDraftId, {
        message: trimmed,
        projectPath: projectPath.trim(),
      });
    } else {
      const draft = draftStore.saveDraft(trimmed, projectPath.trim());
      setEditingDraftId(draft.id);
    }
    // Flash confirmation
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const handleClose = () => {
    setEditingDraftId(null);
    store.closeNewSession();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
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
      // silently ignore - user may have cancelled or picker unavailable
    } finally {
      setPicking(false);
    }
  };

  const canSaveDraft = message.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={handleClose}>
      <div
        className="w-full max-w-2xl bg-background border border-border p-5 space-y-4"
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
          <Button size="icon" variant="ghost" onClick={handleClose}>
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

        <div className="flex items-center justify-between pt-1">
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
                setMessage('');
                updateMessage('');
              }}
            >
              clear & start fresh
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
