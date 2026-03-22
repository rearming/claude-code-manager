import { observer } from 'mobx-react-lite';
import type { SessionStore } from '../stores/SessionStore';
import { SessionCard } from './SessionCard';

interface Props {
  store: SessionStore;
}

export const SessionList = observer(({ store }: Props) => {
  if (store.loading) {
    return <div className="session-list-loading">Loading sessions...</div>;
  }

  if (store.error) {
    return <div className="session-list-error">Error: {store.error}</div>;
  }

  if (store.filteredSessions.length === 0) {
    return <div className="session-list-empty">No sessions found</div>;
  }

  const grouped = store.groupedSessions;

  return (
    <div className="session-list">
      {Array.from(grouped.entries()).map(([project, sessions]) => (
        <div key={project} className="session-group">
          <div className="session-group-header">{project}</div>
          {sessions.map((session) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              isSelected={store.selectedSessionId === session.sessionId}
              onClick={() => store.selectSession(session.sessionId)}
            />
          ))}
        </div>
      ))}
    </div>
  );
});
