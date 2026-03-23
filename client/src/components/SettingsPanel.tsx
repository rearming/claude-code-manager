import { observer } from 'mobx-react-lite';
import type { SessionStore } from '../stores/SessionStore';

interface Props {
  store: SessionStore;
}

export const SettingsPanel = observer(({ store }: Props) => {
  if (!store.showSettings) return null;

  return (
    <div className="settings-overlay" onClick={() => store.toggleSettings()}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>Settings</h3>
          <button className="settings-close" onClick={() => store.toggleSettings()}>
            &times;
          </button>
        </div>
        <div className="settings-body">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={store.settings.autoScrollOnNewMessages}
              onChange={(e) => store.setAutoScroll(e.target.checked)}
            />
            <span className="toggle-slider" />
            <span className="toggle-label">Auto-scroll on new messages</span>
          </label>
          <p className="settings-description">
            Automatically scroll to the bottom when new messages arrive or during streaming responses.
          </p>
        </div>
      </div>
    </div>
  );
});
