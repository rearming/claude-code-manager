import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { FileEdit, FilePlus, Check, CheckCheck, ChevronDown, ChevronRight, Files } from 'lucide-react';
import { cn } from '@/components/shadcn/lib/utils';
import { Button } from '@/components/shadcn/ui/button';
import type { FileChangeTracker, TrackedFileChange } from '../stores/SessionStore';

interface Props {
  tracker: FileChangeTracker;
}

function fileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function dirPath(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 1) return '';
  parts.pop();
  // Show last 2 dir segments max
  const dirs = parts.slice(-2);
  return (parts.length > 2 ? '.../' : '') + dirs.join('/') + '/';
}

function FileChangeRow({ change, onAcknowledge }: { change: TrackedFileChange; onAcknowledge?: () => void }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 hover:bg-zinc-800/50 group min-w-0">
      {change.changeType === 'created' ? (
        <FilePlus className="h-3 w-3 text-green-500 shrink-0" />
      ) : (
        <FileEdit className="h-3 w-3 text-yellow-500 shrink-0" />
      )}
      <div className="flex-1 min-w-0 flex items-baseline gap-1">
        <span className="text-xs text-zinc-300 truncate">{fileName(change.filePath)}</span>
        <span className="text-[10px] text-zinc-600 truncate">{dirPath(change.filePath)}</span>
      </div>
      {change.touchCount > 1 && (
        <span className="text-[10px] text-zinc-600 shrink-0">x{change.touchCount}</span>
      )}
      {onAcknowledge && (
        <button
          className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-200 transition-all shrink-0"
          onClick={onAcknowledge}
          title="acknowledge"
        >
          <Check className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export const ChangedFilesPanel = observer(({ tracker }: Props) => {
  const [showAll, setShowAll] = useState(false);
  const pending = tracker.pendingFiles;
  const acknowledged = tracker.acknowledgedFilesList;
  const allFiles = tracker.allFilesList;

  if (allFiles.length === 0) return null;

  return (
    <div className="border-b border-border">
      {/* pending section */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-3 py-1.5 bg-black/30">
            <div className="flex items-center gap-1.5">
              <Files className="h-3 w-3 text-yellow-500" />
              <span className="text-[11px] text-zinc-400 font-medium">
                {pending.length} pending
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-[10px] text-zinc-500 hover:text-zinc-200"
              onClick={() => tracker.acknowledgeAll()}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              confirm all
            </Button>
          </div>
          <div className="max-h-[140px] overflow-y-auto">
            {pending.map(change => (
              <FileChangeRow
                key={change.filePath}
                change={change}
                onAcknowledge={() => tracker.acknowledge(change.filePath)}
              />
            ))}
          </div>
        </div>
      )}

      {/* all files toggle */}
      <div
        className={cn(
          'flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-zinc-800/30 transition-colors',
          pending.length > 0 && 'border-t border-zinc-800',
        )}
        onClick={() => setShowAll(!showAll)}
      >
        {showAll ? (
          <ChevronDown className="h-3 w-3 text-zinc-600" />
        ) : (
          <ChevronRight className="h-3 w-3 text-zinc-600" />
        )}
        <span className="text-[11px] text-zinc-500">
          all changes ({allFiles.length})
        </span>
        {acknowledged.length > 0 && (
          <span className="text-[10px] text-zinc-600">
            {acknowledged.length} confirmed
          </span>
        )}
      </div>
      {showAll && (
        <div className="max-h-[200px] overflow-y-auto border-t border-zinc-800">
          {allFiles.map(change => {
            const isAcked = tracker.acknowledgedFiles.has(change.filePath);
            return (
              <div key={change.filePath} className={cn('flex items-center gap-2 px-2 py-1 min-w-0', isAcked && 'opacity-50')}>
                {change.changeType === 'created' ? (
                  <FilePlus className="h-3 w-3 text-green-500 shrink-0" />
                ) : (
                  <FileEdit className="h-3 w-3 text-yellow-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0 flex items-baseline gap-1">
                  <span className="text-xs text-zinc-300 truncate">{fileName(change.filePath)}</span>
                  <span className="text-[10px] text-zinc-600 truncate">{dirPath(change.filePath)}</span>
                </div>
                {change.touchCount > 1 && (
                  <span className="text-[10px] text-zinc-600 shrink-0">x{change.touchCount}</span>
                )}
                {isAcked && <Check className="h-3 w-3 text-green-700 shrink-0" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
