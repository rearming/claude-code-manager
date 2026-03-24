import { observer } from 'mobx-react-lite';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { SessionStore } from '../stores/SessionStore';
import { SearchBar } from './SearchBar';
import { SessionList } from './SessionList';
import { SessionDetail } from './SessionDetail';
import { SettingsPanel } from './SettingsPanel';
import { NewSessionDialog } from './NewSessionDialog';
import { TerminalPanel } from './TerminalPanel';

interface Props {
  store: SessionStore;
}

export const Layout = observer(({ store }: Props) => {
  // Show streaming view when a new session is being created (no selectedDetail yet)
  // Also keep showing while streamingText is set (between stream end and session reload)
  const showNewSessionStreaming = !store.selectedDetail && (store.sending || store.streamingText);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Claude Code Manager</h1>
          <div className="sidebar-header-actions">
            <button
              className="new-session-button"
              onClick={() => store.openNewSession()}
              title="New Session"
            >
              +
            </button>
            <button
              className={`settings-button ${store.showTerminal ? 'settings-button-active' : ''}`}
              onClick={() => store.toggleTerminal()}
              title="Raw Terminal"
            >
              &gt;_
            </button>
            <button
              className="settings-button"
              onClick={() => store.toggleSettings()}
              title="Settings"
            >
              &#x2699;
            </button>
          </div>
        </div>
        <SearchBar store={store} />
        <SessionList store={store} />
      </aside>
      <div className="main-with-toolbar">
        <main className="main-content">
          {store.selectedDetail ? (
            <SessionDetail store={store} />
          ) : showNewSessionStreaming ? (
            <div className="session-detail">
              <div className="detail-header">
                <div className="detail-header-info">
                  <h2>New Session</h2>
                  <div className="detail-meta">
                    <span>Starting...</span>
                  </div>
                </div>
              </div>
              <div className="messages-wrapper">
                <div className="messages-container">
                  {store.pendingUserMessage && (
                    <div className="message message-user">
                      <div className="message-header">
                        <span className="message-role">You</span>
                        <span className="message-time">just now</span>
                      </div>
                      <div className="message-content">{store.pendingUserMessage}</div>
                    </div>
                  )}
                  {store.streamingText ? (
                    <div className="message message-assistant streaming">
                      <div className="message-header">
                        <span className="message-role">Claude</span>
                        <span className="streaming-indicator">streaming...</span>
                      </div>
                      <div className="message-content markdown-body">
                        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                          {store.streamingText}
                        </Markdown>
                      </div>
                    </div>
                  ) : (
                    <div className="message message-assistant streaming">
                      <div className="message-header">
                        <span className="message-role">Claude</span>
                        <span className="streaming-indicator">thinking...</span>
                      </div>
                      <div className="message-content">
                        <span className="text-muted">Waiting for response...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="message-input-container">
                <button className="cancel-button" onClick={() => store.cancelSend()}>
                  Cancel
                </button>
              </div>
            </div>
          ) : store.detailLoading ? (
            <div className="empty-state">Loading conversation...</div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">&#x1F4AC;</div>
              <h2>Select a session</h2>
              <p>Choose a conversation from the sidebar to view it here</p>
            </div>
          )}
        </main>
        <div className="bottom-toolbar">
          <div className="toolbar-section">
            <button
              className={`toolbar-button ${store.settings.globalExpandTools ? 'toolbar-button-active' : ''}`}
              onClick={() => store.toggleGlobalExpandTools()}
              title="Toggle all tool calls expanded/collapsed"
            >
              <span className="toolbar-icon">{store.settings.globalExpandTools ? '\u25BC' : '\u25B6'}</span>
              <span>Tools</span>
            </button>
            <button
              className={`toolbar-button ${store.settings.globalShowDiffs ? 'toolbar-button-active' : ''}`}
              onClick={() => store.toggleGlobalShowDiffs()}
              title="Toggle code diffs for Edit/Write tool calls"
            >
              <span className="toolbar-icon">&plusmn;</span>
              <span>Diffs</span>
            </button>
          </div>
          <div className="toolbar-section toolbar-info">
            {store.selectedDetail && (
              <span className="toolbar-status">
                {store.selectedDetail.messages.length} messages
                {store.selectedDetail.messages.reduce((sum, m) => sum + (m.toolCalls?.length || 0), 0) > 0 &&
                  ` \u00B7 ${store.selectedDetail.messages.reduce((sum, m) => sum + (m.toolCalls?.length || 0), 0)} tool calls`
                }
              </span>
            )}
          </div>
        </div>
      </div>
      <TerminalPanel store={store} />
      <SettingsPanel store={store} />
      <NewSessionDialog store={store} />
    </div>
  );
});
