import { observer } from 'mobx-react-lite';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { SessionStore } from '../stores/SessionStore';
import type { SessionSummary } from '../types';
import { SessionCard } from './SessionCard';
import type { SessionStatus } from './SessionCard';

interface Props {
  store: SessionStore;
}

/** Last segment of a path: /Users/foo/projects/bar → bar */
function shortProjectName(fullPath: string): string {
  const parts = fullPath.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || fullPath;
}

export const SessionList = observer(({ store }: Props) => {
  if (store.loading) {
    return <div className="p-5 text-center text-zinc-500 text-sm">loading sessions...</div>;
  }

  if (store.error) {
    return <div className="p-5 text-center text-red-400 text-sm">error: {store.error}</div>;
  }

  if (store.filteredSessions.length === 0) {
    return <div className="p-5 text-center text-zinc-500 text-sm">no sessions found</div>;
  }

  const grouped = store.groupedSessions;
  const streamingSids = store.streamingSessionIds;
  const draftSids = store.inputDraftSessionIds;
  const activeSessionId = store.activeTab?.sessionId;

  const getStatus = (sessionId: string): SessionStatus => {
    if (streamingSids.has(sessionId)) return 'streaming';
    return null;
  };

  // Active = only the individual sessions that are streaming or have draft input
  const activeSessionIds = new Set<string>();
  const activeSessions: SessionSummary[] = [];
  for (const [, sessions] of grouped) {
    for (const s of sessions) {
      if (streamingSids.has(s.sessionId) || draftSids.has(s.sessionId)) {
        activeSessions.push(s);
        activeSessionIds.add(s.sessionId);
      }
    }
  }
  // Sort: streaming first, then draft, then recency
  activeSessions.sort((a, b) => {
    const aStream = streamingSids.has(a.sessionId) ? 2 : draftSids.has(a.sessionId) ? 1 : 0;
    const bStream = streamingSids.has(b.sessionId) ? 2 : draftSids.has(b.sessionId) ? 1 : 0;
    if (aStream !== bStream) return bStream - aStream;
    return b.lastTimestamp - a.lastTimestamp;
  });

  // Rest: grouped by project, but skip sessions already shown in active
  const restEntries: [string, SessionSummary[]][] = [];
  for (const [project, sessions] of grouped) {
    const remaining = sessions.filter(s => !activeSessionIds.has(s.sessionId));
    if (remaining.length > 0) restEntries.push([project, remaining]);
  }
  const hasActive = activeSessions.length > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      {hasActive && (
        <div>
          <div
            className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 bg-black/50 border-b border-zinc-700/50 sticky top-0 z-10 flex items-center gap-1.5 cursor-pointer select-none hover:text-zinc-400 transition-colors"
            onClick={() => store.toggleActiveCollapsed()}
          >
            {store.activeCollapsed ? (
              <ChevronRight className="w-3 h-3 shrink-0" />
            ) : (
              <ChevronDown className="w-3 h-3 shrink-0" />
            )}
            active
            {store.activeCollapsed && (
              <span className="ml-auto text-[10px] font-normal text-zinc-600">
                {activeSessions.length}
              </span>
            )}
          </div>
          {!store.activeCollapsed &&
            activeSessions.map((session) => (
              <SessionCard
                key={`active-${session.sessionId}`}
                session={session}
                isSelected={activeSessionId === session.sessionId}
                status={getStatus(session.sessionId)}
                isArchived={store.isArchived(session.sessionId)}
                customName={store.getCustomName(session.sessionId)}
                projectLabel={shortProjectName(session.project)}
                onClick={() => store.openTab(session.sessionId)}
                onRename={(name) => store.renameSession(session.sessionId, name)}
                onArchive={() =>
                  store.isArchived(session.sessionId)
                    ? store.unarchiveSession(session.sessionId)
                    : store.archiveSession(session.sessionId)
                }
              />
            ))}
        </div>
      )}
      {restEntries.map(([project, sessions]) => {
        const collapsed = store.isProjectCollapsed(project);
        return (
          <div key={project}>
            <div
              className="px-4 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider bg-black/80 border-b border-border sticky top-0 flex items-center gap-1.5 cursor-pointer select-none hover:text-zinc-400 transition-colors"
              onClick={() => store.toggleProjectCollapsed(project)}
            >
              {collapsed ? (
                <ChevronRight className="w-3 h-3 shrink-0" />
              ) : (
                <ChevronDown className="w-3 h-3 shrink-0" />
              )}
              {project}
              {collapsed && (
                <span className="ml-auto text-[10px] font-normal text-zinc-600">
                  {sessions.length}
                </span>
              )}
            </div>
            {!collapsed &&
              sessions.map((session) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  isSelected={activeSessionId === session.sessionId}
                  status={getStatus(session.sessionId)}
                  isArchived={store.isArchived(session.sessionId)}
                  customName={store.getCustomName(session.sessionId)}
                  onClick={() => store.openTab(session.sessionId)}
                  onRename={(name) => store.renameSession(session.sessionId, name)}
                  onArchive={() =>
                    store.isArchived(session.sessionId)
                      ? store.unarchiveSession(session.sessionId)
                      : store.archiveSession(session.sessionId)
                  }
                />
              ))}
          </div>
        );
      })}
    </div>
  );
});
