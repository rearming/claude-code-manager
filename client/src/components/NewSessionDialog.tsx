import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { X, FolderOpen } from 'lucide-react';
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
import type { ImageAttachment } from '../types';
import { pickDirectory } from '../api';

interface Props {
  store: SessionStore;
}

export const NewSessionDialog = observer(({ store }: Props) => {
  const [message, setMessage] = useState(() => localStorage.getItem('ccm-new-session-message') || '');
  const [projectPath, setProjectPath] = useState(() => localStorage.getItem('ccm-last-project-dir') || '');
  const [picking, setPicking] = useState(false);

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
    localStorage.removeItem('ccm-new-session-message');
    setMessage('');
    store.startNewSession(text, trimmedPath, images);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      store.closeNewSession();
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

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => store.closeNewSession()}>
      <div
        className="w-full max-w-2xl bg-background border border-border p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-200">new session</h3>
          <Button size="icon" variant="ghost" onClick={() => store.closeNewSession()}>
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
      </div>
    </div>
  );
});
