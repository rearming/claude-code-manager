import { useState, useRef, useEffect, useCallback } from 'react';
import { Archive, ArchiveRestore, GitBranch, GitFork } from 'lucide-react';
import type { SessionSummary } from '../types';

export type SessionStatus = 'streaming' | 'idle' | null;

interface Props {
  session: SessionSummary;
  isSelected: boolean;
  status?: SessionStatus;
  isArchived?: boolean;
  customName?: string;
  onClick: () => void;
  onArchive?: () => void;
  onRename?: (name: string) => void;
}

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

export function SessionCard({ session, isSelected, status, isArchived, customName, onClick, onArchive, onRename }: Props) {
  const title = customName
    || (session.slug ? session.slug.replaceAll('-', ' ') : truncate(session.firstMessage, 60));

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startRename = useCallback(() => {
    setEditValue(title || '');
    setEditing(true);
  }, [title]);

  const commitRename = useCallback(() => {
    setEditing(false);
    if (onRename) onRename(editValue.trim());
  }, [editValue, onRename]);

  const cancelRename = useCallback(() => {
    setEditing(false);
    setEditValue('');
  }, []);

  const borderColor = status === 'streaming'
    ? 'border-l-green-500'
    : isSelected
      ? 'border-l-zinc-400'
      : '';

  return (
    <div
      className={`group px-4 py-3 border-b border-border cursor-pointer transition-colors hover:bg-zinc-900 ${
        isSelected ? 'bg-zinc-800 border-l-2 ' + borderColor : status ? 'border-l-2 ' + borderColor : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {editing ? (
          <input
            ref={inputRef}
            className="text-sm font-medium text-zinc-200 bg-zinc-800 border border-zinc-600 px-1.5 py-0.5 rounded-none outline-none focus:ring-0 flex-1 min-w-0"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') cancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className="text-sm font-medium text-zinc-200 truncate flex-1"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (onRename) startRename();
            }}
          >
            {title || 'untitled session'}
          </div>
        )}
        {onArchive && (
          <button
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            title={isArchived ? 'unarchive' : 'archive'}
          >
            {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </button>
        )}
        {status === 'streaming' && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] text-green-400 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            live
          </span>
        )}
      </div>
      <div className="text-xs text-zinc-500 mt-1 truncate">
        {truncate(session.firstMessage, 80)}
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-500">
        <span>{formatDate(session.lastTimestamp)}</span>
        <span className="text-zinc-600">·</span>
        <span>{session.messageCount} msgs</span>
        {session.gitBranch && (
          <>
            <span className="text-zinc-600">·</span>
            <span className="flex items-center gap-0.5">
              <GitBranch className="h-3 w-3" />
              {session.gitBranch}
            </span>
          </>
        )}
        {session.forkedFrom && (
          <>
            <span className="text-zinc-600">·</span>
            <GitFork className="h-3 w-3 text-zinc-400" />
          </>
        )}
      </div>
    </div>
  );
}
