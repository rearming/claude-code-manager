import { observer } from 'mobx-react-lite';
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
  const streamingSid = store.streamingSessionId;

  const getStatus = (sessionId: string): SessionStatus => {
    if (sessionId === streamingSid) return 'streaming';
    return null;
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {Array.from(grouped.entries()).map(([project, sessions]) => (
        <div key={project}>
          <div className="px-4 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider bg-black/30 border-b border-border sticky top-0">
            {project}
          </div>
          {sessions.map((session) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              isSelected={store.selectedSessionId === session.sessionId}
              status={getStatus(session.sessionId)}
              isArchived={store.isArchived(session.sessionId)}
              onClick={() => store.selectSession(session.sessionId)}
              onArchive={() =>
                store.isArchived(session.sessionId)
                  ? store.unarchiveSession(session.sessionId)
                  : store.archiveSession(session.sessionId)
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
});
