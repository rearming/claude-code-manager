import { useState, useRef, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import type { SessionStore } from '../stores/SessionStore';

interface Props {
  store: SessionStore;
}

export const TerminalPanel = observer(({ store }: Props) => {
  const [input, setInput] = useState('');
  const [width, setWidth] = useState(480);
  const outputRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Auto-scroll to bottom on new raw lines
  useEffect(() => {
    const el = outputRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [store.rawLines.length]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !store.selectedSessionId || store.sending) return;
    store.sendMessage(store.selectedSessionId, trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Resize handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX - ev.clientX;
      setWidth(Math.max(300, Math.min(900, startWidth + delta)));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [width]);

  if (!store.showTerminal) return null;

  return (
    <div className="terminal-panel" style={{ width }}>
      <div className="terminal-resize-handle" onMouseDown={handleMouseDown} />
      <div className="terminal-header">
        <span className="terminal-title">Raw Terminal</span>
        <div className="terminal-header-actions">
          <button
            className="terminal-clear-button"
            onClick={() => store.clearRawLines()}
            title="Clear"
          >
            Clear
          </button>
          <button
            className="terminal-close-button"
            onClick={() => store.toggleTerminal()}
            title="Close"
          >
            &times;
          </button>
        </div>
      </div>
      <div className="terminal-output" ref={outputRef}>
        {store.rawLines.length === 0 ? (
          <div className="terminal-empty">
            Raw JSON stream will appear here when you send a message...
          </div>
        ) : (
          store.rawLines.map((line, i) => (
            <div key={i} className="terminal-line">
              <span className="terminal-line-num">{i + 1}</span>
              <pre className="terminal-line-content">{formatJson(line)}</pre>
            </div>
          ))
        )}
      </div>
      <div className="terminal-input-container">
        <textarea
          className="terminal-input"
          placeholder={store.sending ? 'Streaming...' : 'Send raw message...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={store.sending || !store.selectedSessionId}
          rows={2}
        />
        <button
          className="terminal-send-button"
          onClick={handleSend}
          disabled={!input.trim() || store.sending || !store.selectedSessionId}
        >
          Send
        </button>
      </div>
    </div>
  );
});

function formatJson(line: string): string {
  try {
    return JSON.stringify(JSON.parse(line), null, 2);
  } catch {
    return line;
  }
}
