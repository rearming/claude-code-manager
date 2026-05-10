import { useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { X, FileEdit, FilePlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/components/shadcn/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/shadcn/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/shadcn/ui/button';
import type { ConversationMessage, ToolCallSummary } from '../types';

export interface FileDiff {
  filePath: string;
  changeType: 'created' | 'edited';
  edits: Array<{
    oldString: string;
    newString: string;
    isWrite: boolean;
  }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  messages: ConversationMessage[];
  /** If set, show only this file's diffs initially */
  initialFile?: string;
}

/** Gather all file diffs from session messages */
function gatherDiffs(messages: ConversationMessage[]): FileDiff[] {
  const fileMap = new Map<string, FileDiff>();

  function processToolCalls(toolCalls: ToolCallSummary[]) {
    for (const tc of toolCalls) {
      const filePath = tc.input.file_path as string | undefined;
      if (!filePath) continue;

      if (tc.name === 'Edit' || tc.name === 'MultiEdit') {
        if (tc.input.old_string === undefined && tc.input.new_string === undefined) continue;
        let entry = fileMap.get(filePath);
        if (!entry) {
          entry = { filePath, changeType: 'edited', edits: [] };
          fileMap.set(filePath, entry);
        }
        entry.edits.push({
          oldString: (tc.input.old_string as string) || '',
          newString: (tc.input.new_string as string) || '',
          isWrite: false,
        });
      } else if (tc.name === 'Write' && tc.input.content !== undefined) {
        let entry = fileMap.get(filePath);
        if (!entry) {
          entry = { filePath, changeType: 'created', edits: [] };
          fileMap.set(filePath, entry);
        } else {
          // If previously edited, a Write overwrites — mark as created
          entry.changeType = 'created';
        }
        entry.edits.push({
          oldString: '',
          newString: (tc.input.content as string) || '',
          isWrite: true,
        });
      }
    }
  }

  for (const msg of messages) {
    if (msg.toolCalls) processToolCalls(msg.toolCalls);
    if (msg.subagentToolCalls) processToolCalls(msg.subagentToolCalls);
  }

  return Array.from(fileMap.values());
}

function fileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

/** Renders a unified-style diff block */
function DiffBlock({ oldString, newString, isWrite }: { oldString: string; newString: string; isWrite: boolean }) {
  if (isWrite) {
    const lines = newString.split('\n');
    return (
      <div className="border border-zinc-800 bg-black/40 overflow-hidden">
        <div className="px-3 py-1 border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
          file written
        </div>
        <div className="overflow-x-auto">
          <pre className="text-xs font-[--font-mono] leading-relaxed">
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="select-none w-10 shrink-0 text-right pr-3 text-zinc-700 border-r border-zinc-800/50">{i + 1}</span>
                <span className="pl-3 text-green-300/80">{line || ' '}</span>
              </div>
            ))}
          </pre>
        </div>
      </div>
    );
  }

  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');

  return (
    <div className="border border-zinc-800 bg-black/40 overflow-hidden">
      <div className="overflow-x-auto">
        <pre className="text-xs font-[--font-mono] leading-relaxed">
          {/* removed lines */}
          {oldLines.map((line, i) => (
            <div key={`old-${i}`} className="flex bg-red-950/30">
              <span className="select-none w-10 shrink-0 text-right pr-3 text-red-900 border-r border-zinc-800/50">{i + 1}</span>
              <span className="select-none w-5 shrink-0 text-center text-red-500">-</span>
              <span className="text-red-300/80 pr-3">{line || ' '}</span>
            </div>
          ))}
          {/* added lines */}
          {newLines.map((line, i) => (
            <div key={`new-${i}`} className="flex bg-green-950/30">
              <span className="select-none w-10 shrink-0 text-right pr-3 text-green-900 border-r border-zinc-800/50">{i + 1}</span>
              <span className="select-none w-5 shrink-0 text-center text-green-500">+</span>
              <span className="text-green-300/80 pr-3">{line || ' '}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

export const DiffViewerModal = observer(({ open, onClose, messages, initialFile }: Props) => {
  const allDiffs = useMemo(() => gatherDiffs(messages), [messages]);

  const initialIndex = useMemo(() => {
    if (!initialFile) return 0;
    const idx = allDiffs.findIndex(d => d.filePath === initialFile);
    return idx >= 0 ? idx : 0;
  }, [allDiffs, initialFile]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(initialFile ? initialIndex : null);

  // Reset selection when modal opens with a specific file
  const [lastInitialFile, setLastInitialFile] = useState(initialFile);
  if (initialFile !== lastInitialFile) {
    setLastInitialFile(initialFile);
    if (initialFile) {
      const idx = allDiffs.findIndex(d => d.filePath === initialFile);
      setSelectedIndex(idx >= 0 ? idx : null);
    } else {
      setSelectedIndex(null);
    }
  }

  if (allDiffs.length === 0) return null;

  const showingAll = selectedIndex === null;
  const currentDiff = selectedIndex !== null ? allDiffs[selectedIndex] : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-[90vw] w-[900px] max-h-[85vh] flex flex-col p-0 gap-0"
        withCloseButton={false}
      >
        <VisuallyHidden><DialogTitle>diff viewer</DialogTitle></VisuallyHidden>

        {/* header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-300 font-medium">
              {showingAll ? 'all diffs' : fileName(currentDiff!.filePath)}
            </span>
            {!showingAll && (
              <span className="text-[10px] text-zinc-600 font-[--font-mono]">
                {currentDiff!.filePath}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!showingAll && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-200"
                onClick={() => setSelectedIndex(null)}
              >
                show all
              </Button>
            )}
            <button
              className="text-zinc-500 hover:text-zinc-200 transition-colors"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* file list sidebar */}
          <div className="w-56 shrink-0 border-r border-zinc-800 overflow-y-auto bg-black/30">
            <div
              className={cn(
                'px-3 py-1.5 text-[11px] cursor-pointer hover:bg-zinc-800/50 transition-colors',
                showingAll ? 'text-zinc-200 bg-zinc-800/70' : 'text-zinc-500'
              )}
              onClick={() => setSelectedIndex(null)}
            >
              all diffs ({allDiffs.length})
            </div>
            {allDiffs.map((diff, i) => (
              <div
                key={diff.filePath}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-zinc-800/50 transition-colors min-w-0',
                  selectedIndex === i ? 'bg-zinc-800/70' : ''
                )}
                onClick={() => setSelectedIndex(i)}
              >
                {diff.changeType === 'created' ? (
                  <FilePlus className="h-3 w-3 text-green-500 shrink-0" />
                ) : (
                  <FileEdit className="h-3 w-3 text-yellow-500 shrink-0" />
                )}
                <span className={cn(
                  'text-xs truncate',
                  selectedIndex === i ? 'text-zinc-200' : 'text-zinc-400'
                )}>
                  {fileName(diff.filePath)}
                </span>
                {diff.edits.length > 1 && (
                  <span className="text-[10px] text-zinc-600 shrink-0">x{diff.edits.length}</span>
                )}
              </div>
            ))}
          </div>

          {/* diff content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {showingAll ? (
              allDiffs.map((diff) => (
                <div key={diff.filePath}>
                  <div className="flex items-center gap-2 mb-2">
                    {diff.changeType === 'created' ? (
                      <FilePlus className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <FileEdit className="h-3.5 w-3.5 text-yellow-500" />
                    )}
                    <span className="text-xs text-zinc-300 font-[--font-mono]">{diff.filePath}</span>
                  </div>
                  <div className="space-y-2 ml-5">
                    {diff.edits.map((edit, j) => (
                      <DiffBlock key={j} oldString={edit.oldString} newString={edit.newString} isWrite={edit.isWrite} />
                    ))}
                  </div>
                </div>
              ))
            ) : currentDiff ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  {currentDiff.changeType === 'created' ? (
                    <FilePlus className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <FileEdit className="h-3.5 w-3.5 text-yellow-500" />
                  )}
                  <span className="text-xs text-zinc-300 font-[--font-mono]">{currentDiff.filePath}</span>
                  <span className="text-[10px] text-zinc-600">
                    {currentDiff.edits.length} edit{currentDiff.edits.length > 1 ? 's' : ''}
                  </span>
                </div>
                {/* navigation between files */}
                <div className="flex items-center gap-2 mb-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    disabled={selectedIndex === 0}
                    onClick={() => setSelectedIndex((selectedIndex ?? 0) - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[10px] text-zinc-600">
                    {(selectedIndex ?? 0) + 1} / {allDiffs.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    disabled={selectedIndex === allDiffs.length - 1}
                    onClick={() => setSelectedIndex((selectedIndex ?? 0) + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-3">
                  {currentDiff.edits.map((edit, j) => (
                    <DiffBlock key={j} oldString={edit.oldString} newString={edit.newString} isWrite={edit.isWrite} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
