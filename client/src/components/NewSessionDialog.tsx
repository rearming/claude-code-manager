import { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import type { SessionStore } from '../stores/SessionStore';
import { browseDirectory, type BrowseResult } from '../api';

interface Props {
  store: SessionStore;
}

export const NewSessionDialog = observer(({ store }: Props) => {
  const [message, setMessage] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  if (!store.showNewSession) return null;

  const projectPaths = [...new Set(store.sessions.map((s) => s.project))].sort();

  const handleSubmit = () => {
    const trimmedMsg = message.trim();
    const trimmedPath = projectPath.trim();
    if (!trimmedMsg || !trimmedPath) return;
    store.startNewSession(trimmedMsg, trimmedPath);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && message.trim() && projectPath.trim()) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      if (showBrowser) {
        setShowBrowser(false);
      } else {
        store.closeNewSession();
      }
    }
  };

  const openBrowser = async (startPath?: string) => {
    setShowBrowser(true);
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const data = await browseDirectory(startPath || projectPath || undefined);
      setBrowseData(data);
    } catch {
      setBrowseError('Failed to browse directory');
    } finally {
      setBrowseLoading(false);
    }
  };

  const navigateTo = async (dirPath: string) => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const data = await browseDirectory(dirPath);
      setBrowseData(data);
    } catch {
      setBrowseError('Cannot access directory');
      setBrowseLoading(false);
    } finally {
      setBrowseLoading(false);
    }
  };

  const selectDir = (dirPath: string) => {
    setProjectPath(dirPath);
    setShowBrowser(false);
  };

  return (
    <div className="settings-overlay" onClick={() => store.closeNewSession()}>
      <div className="settings-panel new-session-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>New Session</h3>
          <button className="settings-close" onClick={() => store.closeNewSession()}>
            &times;
          </button>
        </div>
        <div className="settings-body">
          <div className="new-session-field">
            <label className="new-session-label">Project directory</label>
            {projectPaths.length > 0 && (
              <select
                className="new-session-select"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
              >
                <option value="">Select a project...</option>
                {projectPaths.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            <div className="path-input-row" style={projectPaths.length > 0 ? { marginTop: 6 } : undefined}>
              <input
                className="new-session-input"
                type="text"
                placeholder={projectPaths.length > 0 ? 'Or type a custom path...' : '/path/to/project'}
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="browse-button"
                onClick={() => openBrowser()}
                title="Browse folders"
                type="button"
              >
                ...
              </button>
            </div>
          </div>

          {showBrowser && (
            <div className="folder-browser">
              {browseLoading && !browseData && (
                <div className="folder-browser-loading">Loading...</div>
              )}
              {browseError && (
                <div className="folder-browser-error">{browseError}</div>
              )}
              {browseData && (
                <>
                  <div className="folder-browser-header">
                    <span className="folder-browser-path" title={browseData.current}>
                      {browseData.current}
                    </span>
                    <button
                      className="folder-browser-select"
                      onClick={() => selectDir(browseData.current)}
                    >
                      Select this folder
                    </button>
                  </div>
                  <div className="folder-browser-list">
                    {browseData.parent && (
                      <div
                        className="folder-browser-item folder-browser-parent"
                        onClick={() => navigateTo(browseData.parent!)}
                      >
                        ..
                      </div>
                    )}
                    {browseData.dirs.map((d) => (
                      <div
                        key={d.path}
                        className="folder-browser-item"
                        onClick={() => navigateTo(d.path)}
                        onDoubleClick={() => selectDir(d.path)}
                        title={`Click to enter, double-click to select`}
                      >
                        <span className="folder-icon">&#128193;</span>
                        {d.name}
                      </div>
                    ))}
                    {browseData.dirs.length === 0 && (
                      <div className="folder-browser-empty">No subdirectories</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="new-session-field">
            <label className="new-session-label">Message</label>
            <textarea
              className="new-session-textarea"
              placeholder="What would you like to work on?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
            />
          </div>
          <button
            className="new-session-submit"
            onClick={handleSubmit}
            disabled={!message.trim() || !projectPath.trim()}
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
});
