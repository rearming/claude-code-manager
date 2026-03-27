import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { FileText, Trash2, Send, ChevronDown, ChevronRight, Pencil, FolderOpen } from 'lucide-react';
import { Button } from '@/components/shadcn/ui/button';
import { Input } from '@/components/shadcn/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/ui/select';
import { draftStore } from '../stores/DraftStore';
import type { SessionStore } from '../stores/SessionStore';
import type { Draft } from '../types';
import { pickDirectory } from '../api';

function formatDate(ts: number): string {
  if (!ts) return '';
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

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

interface DraftCardProps {
  draft: Draft;
  store: SessionStore;
  projectPaths: string[];
}

const DraftCard = observer(({ draft, store, projectPaths }: DraftCardProps) => {
  const [assigning, setAssigning] = useState(false);
  const [assignPath, setAssignPath] = useState('');
  const [picking, setPicking] = useState(false);

  const isFreeform = !draft.projectPath;
  const firstLine = draft.message.split('\n')[0];

  const handleSend = () => {
    if (isFreeform) {
      setAssigning(true);
      return;
    }
    store.startNewSession(draft.message, draft.projectPath, draft.images.length > 0 ? draft.images : undefined);
    draftStore.deleteDraft(draft.id);
  };

  const handleAssignAndSend = () => {
    const trimmed = assignPath.trim();
    if (!trimmed) return;
    draftStore.updateDraft(draft.id, { projectPath: trimmed });
    store.startNewSession(draft.message, trimmed, draft.images.length > 0 ? draft.images : undefined);
    draftStore.deleteDraft(draft.id);
    setAssigning(false);
  };

  const handlePickDirectory = async () => {
    setPicking(true);
    try {
      const selected = await pickDirectory(assignPath || undefined);
      if (selected) setAssignPath(selected);
    } catch {
      // ignore
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="group px-4 py-3 border-b border-border hover:bg-zinc-900 transition-colors">
      <div className="flex items-start gap-2">
        <FileText className="h-3.5 w-3.5 mt-0.5 text-zinc-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-300 truncate">{truncate(firstLine, 80)}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-zinc-600">{formatDate(draft.updatedAt)}</span>
            {draft.images.length > 0 && (
              <span className="text-xs text-zinc-600">{draft.images.length} image{draft.images.length > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
            onClick={() => store.openDraft(draft.id)}
            title="edit draft"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="p-1 text-zinc-600 hover:text-green-400 transition-colors"
            onClick={handleSend}
            title={isFreeform ? 'assign project & send' : 'start session from draft'}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
          <button
            className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
            onClick={() => draftStore.deleteDraft(draft.id)}
            title="delete draft"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {assigning && (
        <div className="mt-2 space-y-2 border-t border-zinc-800 pt-2">
          <p className="text-xs text-zinc-500">select a project to send this draft:</p>
          <div className="flex gap-1.5">
            {projectPaths.length > 0 && (
              <Select
                value={assignPath || '__none__'}
                onValueChange={(val) => setAssignPath(val === '__none__' ? '' : val)}
              >
                <SelectTrigger className="w-[160px] shrink-0 h-7 bg-black/50 text-xs text-zinc-300">
                  <SelectValue placeholder="projects..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">select project...</SelectItem>
                  {projectPaths.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              type="text"
              placeholder="/path/to/project"
              value={assignPath}
              onChange={(e) => setAssignPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAssignAndSend();
                if (e.key === 'Escape') setAssigning(false);
              }}
              className="bg-black/50 flex-1 h-7 text-xs"
            />
            <Button
              size="icon"
              variant="outline"
              className="shrink-0 h-7 w-7"
              onClick={handlePickDirectory}
              disabled={picking}
            >
              <FolderOpen className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={handleAssignAndSend}
              disabled={!assignPath.trim()}
            >
              <Send className="h-3 w-3 mr-1" />
              send
            </Button>
            <button
              className="text-xs text-zinc-600 hover:text-zinc-400 px-2"
              onClick={() => setAssigning(false)}
            >
              cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

interface Props {
  store: SessionStore;
}

export const DraftPanel = observer(({ store }: Props) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('ccm-drafts-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const grouped = draftStore.groupedByProject;
  const count = draftStore.count;
  const projectPaths = store.projects;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('ccm-drafts-collapsed', String(next));
  };

  if (count === 0) return null;

  return (
    <div className="border-b border-border">
      <button
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider bg-black/80 hover:bg-zinc-900/50 transition-colors"
        onClick={toggleCollapsed}
      >
        <span className="flex items-center gap-1.5">
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <FileText className="h-3 w-3" />
          drafts
          <span className="text-zinc-600 font-normal">({count})</span>
        </span>
      </button>

      {!collapsed && (
        <div>
          {Array.from(grouped.entries()).map(([project, drafts]) => (
            <div key={project || '__freeform__'}>
              <div className="px-4 py-1 text-[10px] text-zinc-600 uppercase tracking-wider bg-black/40 border-b border-zinc-800">
                {project || 'freeform (no project)'}
              </div>
              {drafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  store={store}
                  projectPaths={projectPaths}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
