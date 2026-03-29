import { observer } from 'mobx-react-lite';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { SessionStore } from '../stores/SessionStore';
import { SessionCard } from './SessionCard';
import type { SessionStatus } from './SessionCard';

interface Props {
  store: SessionStore;
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
  const activeSessionId = store.activeTab?.sessionId;

  const getStatus = (sessionId: string): SessionStatus => {
    if (streamingSids.has(sessionId)) return 'streaming';
    return null;
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {Array.from(grouped.entries()).map(([project, sessions]) => {
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
