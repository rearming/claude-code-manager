import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { SessionStore } from '../stores/SessionStore';
import type { ConversationMessage } from '../types';

interface Props {
  store: SessionStore;
}

export const SessionDetail = observer(({ store }: Props) => {
  const detail = store.selectedDetail;
  if (!detail) return null;

  const { summary, messages } = detail;

  const handleResume = async () => {
    await store.resume(summary.sessionId);
  };

  const handleCopy = () => {
    if (store.resumeCommand) {
      navigator.clipboard.writeText(store.resumeCommand);
    }
  };

  return (
    <div className="session-detail">
      <div className="detail-header">
        <button className="back-button" onClick={() => store.clearSelection()}>
          &larr; Back
        </button>
        <div className="detail-header-info">
          <h2>{summary.slug?.replaceAll('-', ' ') || summary.firstMessage.slice(0, 60)}</h2>
          <div className="detail-meta">
            <span>{summary.project}</span>
            {summary.gitBranch && <span className="meta-branch">{summary.gitBranch}</span>}
            {summary.version && <span>v{summary.version}</span>}
            <span>{summary.messageCount} messages</span>
            {summary.forkedFrom && (
              <span
                className="meta-fork clickable"
                onClick={() => store.selectSession(summary.forkedFrom!.sessionId)}
              >
                forked from {summary.forkedFrom.sessionId.slice(0, 8)}...
              </span>
            )}
          </div>
        </div>
        <div className="detail-actions">
          <button className="resume-button" onClick={handleResume}>
            Resume Session
          </button>
          {store.resumeCommand && (
            <div className="resume-command">
              <code>{store.resumeCommand}</code>
              <button className="copy-button" onClick={handleCopy}>
                Copy
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="messages-container">
        {messages.map((msg) => (
          <MessageBubble key={msg.uuid} message={msg} />
        ))}
      </div>
    </div>
  );
});

function MessageBubble({ message }: { message: ConversationMessage }) {
  const [showTools, setShowTools] = useState(false);
  const isUser = message.type === 'user';

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-header">
        <span className="message-role">{isUser ? 'You' : 'Claude'}</span>
        <span className="message-time">
          {new Date(message.timestamp).toLocaleString()}
        </span>
        {message.model && (
          <span className="message-model">{message.model}</span>
        )}
      </div>
      <div className="message-content">
        {message.content || <span className="text-muted">(tool calls only)</span>}
      </div>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="tool-calls">
          <button
            className="tool-toggle"
            onClick={() => setShowTools(!showTools)}
          >
            {showTools ? 'Hide' : 'Show'} {message.toolCalls.length} tool call
            {message.toolCalls.length > 1 ? 's' : ''}
          </button>
          {showTools && (
            <div className="tool-calls-list">
              {message.toolCalls.map((tc, i) => (
                <div key={i} className="tool-call">
                  <span className="tool-name">{tc.name}</span>
                  <span className="tool-input">{tc.input}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
