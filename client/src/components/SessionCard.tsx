import { GitBranch, GitFork } from 'lucide-react';
import type { SessionSummary } from '../types';

interface Props {
  session: SessionSummary;
  isSelected: boolean;
  onClick: () => void;
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

export function SessionCard({ session, isSelected, onClick }: Props) {
  const title = session.slug
    ? session.slug.replaceAll('-', ' ')
    : truncate(session.firstMessage, 60);

  return (
    <div
      className={`px-4 py-3 border-b border-border cursor-pointer transition-colors hover:bg-zinc-900 ${
        isSelected ? 'bg-zinc-800 border-l-2 border-l-zinc-400' : ''
      }`}
      onClick={onClick}
    >
      <div className="text-sm font-medium text-zinc-200 truncate">{title || 'untitled session'}</div>
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
