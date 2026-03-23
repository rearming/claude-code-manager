import { observer } from 'mobx-react-lite';
import type { SessionStore } from '../stores/SessionStore';
import { SearchBar } from './SearchBar';
import { SessionList } from './SessionList';
import { SessionDetail } from './SessionDetail';
import { SettingsPanel } from './SettingsPanel';

interface Props {
  store: SessionStore;
}

export const Layout = observer(({ store }: Props) => {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Claude Code Manager</h1>
          <button
            className="settings-button"
            onClick={() => store.toggleSettings()}
            title="Settings"
          >
            &#x2699;
          </button>
        </div>
        <SearchBar store={store} />
        <SessionList store={store} />
      </aside>
      <main className="main-content">
        {store.selectedDetail ? (
          <SessionDetail store={store} />
        ) : store.detailLoading ? (
          <div className="empty-state">Loading conversation...</div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <h2>Select a session</h2>
            <p>Choose a conversation from the sidebar to view it here</p>
          </div>
        )}
      </main>
      <SettingsPanel store={store} />
    </div>
  );
});
