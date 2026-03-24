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
import type { SessionStore } from '../stores/SessionStore';
import { browseDirectory, type BrowseResult } from '../api';

interface Props {
  store: SessionStore;
}

export const NewSessionDialog = observer(({ store }: Props) => {
  const [message, setMessage] = useState(() => localStorage.getItem('ccm-new-session-message') || '');
  const [projectPath, setProjectPath] = useState(() => localStorage.getItem('ccm-last-project-dir') || '');

  const updateMessage = (val: string) => {
    setMessage(val);
    localStorage.setItem('ccm-new-session-message', val);
  };
  const updateProjectPath = (val: string) => {
    setProjectPath(val);
    localStorage.setItem('ccm-last-project-dir', val);
  };
  const [showBrowser, setShowBrowser] = useState(false);
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  if (!store.showNewSession) return null;

  const projectPaths = [...new Set(store.sessions.map((s) => s.project))].sort();

  const handleSubmit = () => {
    const trimmedMsg = message.trim();
    const trimmedPath = projectPath.trim();
    if (!trimmedMsg || !trimmedPath) return;
    localStorage.removeItem('ccm-new-session-message');
    store.startNewSession(trimmedMsg, trimmedPath);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && message.trim() && projectPath.trim()) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      if (showBrowser) {
        setShowBrowser(false);
      } else {
        store.closeNewSession();
      }
    }
  };

  const openBrowser = async (startPath?: string) => {
    setShowBrowser(true);
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const data = await browseDirectory(startPath || projectPath || undefined);
      setBrowseData(data);
    } catch {
      setBrowseError('failed to browse directory');
    } finally {
      setBrowseLoading(false);
    }
  };

  const navigateTo = async (dirPath: string) => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const data = await browseDirectory(dirPath);
      setBrowseData(data);
    } catch {
      setBrowseError('cannot access directory');
    } finally {
      setBrowseLoading(false);
    }
  };

  const selectDir = (dirPath: string) => {
    updateProjectPath(dirPath);
    setShowBrowser(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => store.closeNewSession()}>
      <div
        className="w-full max-w-lg bg-background border border-border p-5 space-y-4"
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
          {projectPaths.length > 0 && (
            <Select
              value={projectPath || '__none__'}
              onValueChange={(val) => updateProjectPath(val === '__none__' ? '' : val)}
            >
              <SelectTrigger className="w-full h-8 bg-black/50 text-sm text-zinc-300">
                <SelectValue placeholder="select a project..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">select a project...</SelectItem>
                {projectPaths.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder={projectPaths.length > 0 ? 'or type a custom path...' : '/path/to/project'}
              value={projectPath}
              onChange={(e) => updateProjectPath(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-black/50"
            />
            <Button size="icon" variant="outline" onClick={() => openBrowser()} type="button">
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showBrowser && (
          <div className="border border-border bg-black/30 max-h-[250px] overflow-hidden flex flex-col">
            {browseLoading && !browseData && (
              <div className="p-3 text-sm text-zinc-500">loading...</div>
            )}
            {browseError && (
              <div className="p-3 text-sm text-red-400">{browseError}</div>
            )}
            {browseData && (
              <>
                <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-zinc-900">
                  <span className="text-xs text-zinc-400 truncate font-[--font-mono]">{browseData.current}</span>
                  <Button size="sm" variant="outline" onClick={() => selectDir(browseData.current)}>
                    select this folder
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {browseData.parent && (
                    <div
                      className="px-3 py-1.5 text-sm text-zinc-400 cursor-pointer hover:bg-zinc-900 transition-colors border-b border-zinc-800"
                      onClick={() => navigateTo(browseData.parent!)}
                    >
                      ..
                    </div>
                  )}
                  {browseData.dirs.map((d) => (
                    <div
                      key={d.path}
                      className="px-3 py-1.5 text-sm text-zinc-300 cursor-pointer hover:bg-zinc-900 transition-colors border-b border-zinc-800 flex items-center gap-2"
                      onClick={() => navigateTo(d.path)}
                      onDoubleClick={() => selectDir(d.path)}
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-zinc-500" />
                      {d.name}
                    </div>
                  ))}
                  {browseData.dirs.length === 0 && (
                    <div className="p-3 text-sm text-zinc-500">no subdirectories</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs text-zinc-500 uppercase tracking-wide">message</label>
          <textarea
            className="w-full bg-black/50 border border-input text-sm text-zinc-300 px-3 py-2 rounded-none resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-zinc-600 font-[inherit]"
            placeholder="what would you like to work on?"
            value={message}
            onChange={(e) => updateMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
          />
        </div>

        <Button
          variant="default"
          className="w-full"
          onClick={handleSubmit}
          disabled={!message.trim() || !projectPath.trim()}
        >
          start session
        </Button>
      </div>
    </div>
  );
});
