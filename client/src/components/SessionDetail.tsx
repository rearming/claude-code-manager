import { useState, useRef, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.min.css';
import type { SessionStore } from '../stores/SessionStore';
import type { ConversationMessage } from '../types';

interface Props {
  store: SessionStore;
}

export const SessionDetail = observer(({ store }: Props) => {
  const detail = store.selectedDetail;
  if (!detail) return null;

  const { summary, messages } = detail;
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  // On mount: either scroll to bottom (after send / new messages) or restore saved position
  useEffect(() => {
    const el = containerRef.current;
    if (!el || messages.length === 0) return;

    if (store.scrollToBottomOnLoad) {
      store.scrollToBottomOnLoad = false;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    } else {
      const saved = store.getScrollPosition(summary.sessionId);
      if (saved !== undefined && saved.messageCount < messages.length) {
        // New messages arrived since we last viewed — scroll to bottom
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      } else if (saved !== undefined) {
        el.scrollTop = saved.position;
      }
    }
    // Only run on initial mount / session switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.sessionId, messages.length]);

  // Save scroll position on scroll
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setShowScrollButton(!isNearBottom());
    store.saveScrollPosition(summary.sessionId, el.scrollTop, messages.length);
  }, [store, summary.sessionId, isNearBottom, messages.length]);

  // Auto-scroll during streaming text updates
  useEffect(() => {
    if (!store.sending || !store.settings.autoScrollOnNewMessages) return;
    const el = containerRef.current;
    if (el && isNearBottom()) {
      el.scrollTop = el.scrollHeight;
    }
  }, [store.streamingText, store.sending, store.settings.autoScrollOnNewMessages, isNearBottom]);

  // Auto-scroll when pending user message appears (optimistic message)
  useEffect(() => {
    if (store.pendingUserMessage && store.settings.autoScrollOnNewMessages) {
      requestAnimationFrame(() => scrollToBottom(false));
    }
  }, [store.pendingUserMessage, store.settings.autoScrollOnNewMessages, scrollToBottom]);

  const handleResume = async () => {
    await store.resume(summary.sessionId);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleFork = async (messageUuid: string) => {
    await store.forkFromMessage(summary.sessionId, messageUuid);
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
              <button className="copy-button" onClick={() => handleCopy(store.resumeCommand!)}>
                Copy
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fork result banner */}
      {store.forkResult && (
        <div className="fork-banner">
          <div className="fork-banner-content">
            <span className="fork-banner-icon">&#x2442;</span>
            <div className="fork-banner-text">
              <strong>Fork created!</strong> New session with {store.forkResult.messagesCopied} messages copied.
            </div>
            <div className="fork-banner-actions">
              <div className="resume-command">
                <code>{store.forkResult.resumeCommand}</code>
                <button
                  className="copy-button"
                  onClick={() => handleCopy(store.forkResult!.resumeCommand)}
                >
                  Copy
                </button>
              </div>
              <button
                className="fork-open-button"
                onClick={() => {
                  const sid = store.forkResult!.sessionId;
                  store.clearForkResult();
                  store.selectSession(sid);
                }}
              >
                Open forked session
              </button>
              <button className="fork-dismiss" onClick={() => store.clearForkResult()}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="messages-wrapper">
        <div className="messages-container" ref={containerRef} onScroll={handleScroll}>
          {messages.map((msg, index) => (
            <MessageBubble
              key={msg.uuid}
              message={msg}
              messageIndex={index}
              totalMessages={messages.length}
              onFork={handleFork}
              forking={store.forking}
            />
          ))}

          {/* Optimistic user message */}
          {store.pendingUserMessage && (
            <div className="message message-user">
              <div className="message-header">
                <span className="message-role">You</span>
                <span className="message-time">just now</span>
              </div>
              <div className="message-content">{store.pendingUserMessage}</div>
            </div>
          )}

          {/* Live streaming response */}
          {store.sending && store.streamingText && (
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
          )}

          {store.sending && !store.streamingText && (
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

        {showScrollButton && (
          <button className="scroll-to-bottom" onClick={() => scrollToBottom()} title="Scroll to bottom">
            &#x2193;
          </button>
        )}
      </div>

      <MessageInput
        onSend={(msg) => store.sendMessage(summary.sessionId, msg)}
        sending={store.sending}
        onCancel={() => store.cancelSend()}
      />
    </div>
  );
});

interface MessageBubbleProps {
  message: ConversationMessage;
  messageIndex: number;
  totalMessages: number;
  onFork: (uuid: string) => void;
  forking: boolean;
}

function MessageBubble({ message, messageIndex, totalMessages, onFork, forking }: MessageBubbleProps) {
  const [showTools, setShowTools] = useState(false);
  const [confirmFork, setConfirmFork] = useState(false);
  const isUser = message.type === 'user';

  const handleForkClick = () => {
    if (confirmFork) {
      onFork(message.uuid);
      setConfirmFork(false);
    } else {
      setConfirmFork(true);
    }
  };

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
        <span className="message-index">
          #{messageIndex + 1}/{totalMessages}
        </span>
        <button
          className={`fork-button ${confirmFork ? 'fork-button-confirm' : ''}`}
          onClick={handleForkClick}
          onBlur={() => setConfirmFork(false)}
          disabled={forking}
          title="Fork conversation from this message"
        >
          {forking ? 'Forking...' : confirmFork ? 'Click to confirm fork' : 'Fork from here'}
        </button>
      </div>
      <div className={`message-content ${isUser ? '' : 'markdown-body'}`}>
        {!message.content ? (
          <span className="text-muted">(tool calls only)</span>
        ) : isUser ? (
          message.content
        ) : (
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {message.content}
          </Markdown>
        )}
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

interface MessageInputProps {
  onSend: (message: string) => void;
  onCancel: () => void;
  sending: boolean;
}

function MessageInput({ onSend, onCancel, sending }: MessageInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && sending) {
      onCancel();
    }
  };

  return (
    <div className="message-input-container">
      <textarea
        ref={textareaRef}
        className="message-input"
        placeholder={sending ? 'Claude is responding... (Esc to cancel)' : 'Send a message to this session... (Enter to send)'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={sending}
        rows={2}
      />
      {sending ? (
        <button className="cancel-button" onClick={onCancel}>
          Cancel
        </button>
      ) : (
        <button
          className="send-button"
          onClick={handleSubmit}
          disabled={!text.trim()}
        >
          Send
        </button>
      )}
    </div>
  );
}
