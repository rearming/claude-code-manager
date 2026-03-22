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
      className={`session-card ${isSelected ? 'session-card-selected' : ''}`}
      onClick={onClick}
    >
      <div className="session-card-title">{title || 'Untitled session'}</div>
      <div className="session-card-preview">
        {truncate(session.firstMessage, 80)}
      </div>
      <div className="session-card-meta">
        <span className="meta-time">{formatDate(session.lastTimestamp)}</span>
        <span className="meta-messages">{session.messageCount} msgs</span>
        {session.gitBranch && (
          <span className="meta-branch">{session.gitBranch}</span>
        )}
        {session.forkedFrom && <span className="meta-fork">forked</span>}
      </div>
    </div>
  );
}
