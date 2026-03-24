import { useState, useRef, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.min.css';
import { ArrowLeft, GitFork, Copy, ChevronDown, ChevronRight, ArrowDown, Send, X } from 'lucide-react';
import { Button } from '@/components/shadcn/ui/button';
import type { SessionStore } from '../stores/SessionStore';
import type { ConversationMessage, ToolCallSummary } from '../types';

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
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      } else if (saved !== undefined) {
        el.scrollTop = saved.position;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.sessionId, messages.length]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setShowScrollButton(!isNearBottom());
    store.saveScrollPosition(summary.sessionId, el.scrollTop, messages.length);
  }, [store, summary.sessionId, isNearBottom, messages.length]);

  useEffect(() => {
    if (!store.sending || !store.settings.autoScrollOnNewMessages) return;
    const el = containerRef.current;
    if (el && isNearBottom()) {
      el.scrollTop = el.scrollHeight;
    }
  }, [store.streamingText, store.sending, store.settings.autoScrollOnNewMessages, isNearBottom]);

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
    <div className="flex flex-col h-full">
      {/* header */}
      <div className="px-5 py-3 border-b border-border flex items-start gap-3">
        <Button size="sm" variant="ghost" onClick={() => store.clearSelection()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-zinc-200 truncate">
            {summary.slug?.replaceAll('-', ' ') || summary.firstMessage.slice(0, 60)}
          </h2>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500 flex-wrap">
            <span>{summary.project}</span>
            {summary.gitBranch && <span className="text-zinc-400 border border-border px-1.5 py-0.5">{summary.gitBranch}</span>}
            {summary.version && <span>v{summary.version}</span>}
            <span>{summary.messageCount} messages</span>
            {summary.forkedFrom && (
              <span
                className="text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors"
                onClick={() => store.selectSession(summary.forkedFrom!.sessionId)}
              >
                <GitFork className="h-3 w-3 inline mr-0.5" />
                forked from {summary.forkedFrom.sessionId.slice(0, 8)}...
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleResume}>resume session</Button>
          {store.resumeCommand && (
            <div className="flex items-center gap-1 border border-border px-2 py-1">
              <code className="text-xs text-zinc-400 font-[--font-mono]">{store.resumeCommand}</code>
              <button className="text-zinc-500 hover:text-zinc-200 transition-colors" onClick={() => handleCopy(store.resumeCommand!)}>
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* fork banner */}
      {store.forkResult && (
        <div className="px-5 py-3 bg-zinc-900 border-b border-border flex items-center gap-3">
          <GitFork className="h-4 w-4 text-zinc-400 shrink-0" />
          <div className="flex-1 text-sm">
            <strong className="text-zinc-200">fork created!</strong>{' '}
            <span className="text-zinc-400">new session with {store.forkResult.messagesCopied} messages copied.</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border border-border px-2 py-1">
              <code className="text-xs text-zinc-400 font-[--font-mono]">{store.forkResult.resumeCommand}</code>
              <button className="text-zinc-500 hover:text-zinc-200" onClick={() => handleCopy(store.forkResult!.resumeCommand)}>
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <Button size="sm" variant="outline" onClick={() => {
              const sid = store.forkResult!.sessionId;
              store.clearForkResult();
              store.selectSession(sid);
            }}>open fork</Button>
            <Button size="sm" variant="ghost" onClick={() => store.clearForkResult()}>dismiss</Button>
          </div>
        </div>
      )}

      {/* messages */}
      <div className="flex-1 relative overflow-hidden">
        <div className="h-full overflow-y-auto p-4 space-y-3" ref={containerRef} onScroll={handleScroll}>
          {messages.map((msg, index) => (
            <MessageBubble
              key={msg.uuid}
              message={msg}
              messageIndex={index}
              totalMessages={messages.length}
              onFork={handleFork}
              forking={store.forking}
              globalExpand={store.settings.globalExpandTools}
              globalDiffs={store.settings.globalShowDiffs}
            />
          ))}

          {store.pendingUserMessage && (
            <div className="p-4 border border-border bg-user-bg ml-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">you</span>
                <span className="text-xs text-zinc-500">just now</span>
              </div>
              <div className="text-sm text-zinc-300">{store.pendingUserMessage}</div>
            </div>
          )}

          {store.streamingText && (
            <div className="p-4 border border-border bg-assistant-bg mr-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">claude</span>
                {store.sending && <span className="text-xs text-green-500 animate-pulse">streaming...</span>}
              </div>
              <div className="text-sm text-zinc-300 markdown-body">
                <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {store.streamingText}
                </Markdown>
              </div>
            </div>
          )}

          {store.sending && !store.streamingText && (
            <div className="p-4 border border-border bg-assistant-bg mr-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">claude</span>
                <span className="text-xs text-zinc-500 animate-pulse">thinking...</span>
              </div>
              <div className="text-sm text-zinc-500">waiting for response...</div>
            </div>
          )}
        </div>

        {showScrollButton && (
          <button
            className="absolute bottom-4 right-4 h-8 w-8 bg-zinc-800 border border-border flex items-center justify-center hover:bg-zinc-700 transition-colors"
            onClick={() => scrollToBottom()}
          >
            <ArrowDown className="h-4 w-4 text-zinc-400" />
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
  globalExpand: boolean;
  globalDiffs: boolean;
}

function MessageBubble({ message, messageIndex, totalMessages, onFork, forking, globalExpand, globalDiffs }: MessageBubbleProps) {
  const [localExpand, setLocalExpand] = useState<boolean | null>(null);
  const [localDiffs, setLocalDiffs] = useState<boolean | null>(null);
  const [confirmFork, setConfirmFork] = useState(false);
  const isUser = message.type === 'user';

  const showTools = localExpand !== null ? localExpand : globalExpand;
  const showDiffs = localDiffs !== null ? localDiffs : globalDiffs;

  const handleForkClick = () => {
    if (confirmFork) {
      onFork(message.uuid);
      setConfirmFork(false);
    } else {
      setConfirmFork(true);
    }
  };

  const toggleTools = () => {
    if (localExpand === null) {
      setLocalExpand(!globalExpand);
    } else {
      setLocalExpand(!localExpand);
    }
  };

  const toggleDiffs = () => {
    if (localDiffs === null) {
      setLocalDiffs(!globalDiffs);
    } else {
      setLocalDiffs(!localDiffs);
    }
  };

  const hasFileTools = message.toolCalls?.some(tc =>
    ['Edit', 'Write', 'MultiEdit'].includes(tc.name) &&
    (tc.input.old_string !== undefined || tc.input.new_string !== undefined || tc.input.content !== undefined)
  );

  const isToolOnly = !isUser && !message.content && message.toolCalls && message.toolCalls.length > 0;
  const marginClass = isToolOnly ? 'mx-6' : isUser ? 'ml-6' : 'mr-6';

  return (
    <div className={`p-4 border border-border ${marginClass} ${isUser ? 'bg-user-bg' : 'bg-assistant-bg'}`}>
      {/* header */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">{isUser ? 'you' : 'claude'}</span>
        <span className="text-xs text-zinc-500">{new Date(message.timestamp).toLocaleString()}</span>
        {message.model && <span className="text-xs text-zinc-600 border border-zinc-700 px-1">{message.model}</span>}
        <span className="text-xs text-zinc-600">#{messageIndex + 1}/{totalMessages}</span>
        <button
          className={`ml-auto text-xs px-2 py-0.5 border transition-colors ${
            confirmFork
              ? 'border-red-800 text-red-400 bg-red-900/20 hover:bg-red-900/40'
              : 'border-border text-zinc-500 hover:text-zinc-300 hover:border-zinc-500'
          }`}
          onClick={handleForkClick}
          onBlur={() => setConfirmFork(false)}
          disabled={forking}
        >
          {forking ? 'forking...' : confirmFork ? 'click to confirm fork' : 'fork from here'}
        </button>
      </div>

      {/* content */}
      <div className="text-sm text-zinc-300">
        {!message.content && message.toolCalls && message.toolCalls.length > 0 ? (
          <div className="flex flex-wrap gap-1 cursor-pointer" onClick={toggleTools}>
            {message.toolCalls.map((tc, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs border border-zinc-700 px-1.5 py-0.5 bg-black/30">
                <span className="text-zinc-400 font-medium">{tc.name}</span>
                <span className="text-zinc-500 truncate max-w-[200px]">{getToolSummary(tc)}</span>
              </span>
            ))}
          </div>
        ) : !message.content ? (
          <span className="text-zinc-500">(empty)</span>
        ) : isUser ? (
          message.content
        ) : (
          <div className="markdown-body">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {message.content}
            </Markdown>
          </div>
        )}
      </div>

      {/* tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-3 border-t border-zinc-800 pt-2">
          <div className="flex items-center gap-2">
            <button
              className={`text-xs flex items-center gap-1 px-2 py-0.5 border transition-colors ${
                showTools ? 'border-zinc-600 text-zinc-300 bg-zinc-800' : 'border-border text-zinc-500 hover:text-zinc-300'
              }`}
              onClick={toggleTools}
            >
              {showTools ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {message.toolCalls.length} tool call{message.toolCalls.length > 1 ? 's' : ''}
            </button>
            {hasFileTools && showTools && (
              <button
                className={`text-xs px-2 py-0.5 border transition-colors ${
                  showDiffs ? 'border-zinc-600 text-zinc-300 bg-zinc-800' : 'border-border text-zinc-500 hover:text-zinc-300'
                }`}
                onClick={toggleDiffs}
              >
                {showDiffs ? 'hide' : 'show'} diffs
              </button>
            )}
          </div>
          {showTools && (
            <div className="mt-2 space-y-1">
              {message.toolCalls.map((tc, i) => (
                <ToolCallView key={i} tool={tc} showDiff={showDiffs} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getToolSummary(tool: ToolCallSummary): string {
  const filePath = tool.input.file_path as string | undefined;
  const isEditTool = tool.name === 'Edit' || tool.name === 'MultiEdit';
  const isWriteTool = tool.name === 'Write';

  if (isEditTool && filePath) {
    const replaceAll = tool.input.replace_all ? ' (all)' : '';
    return filePath + replaceAll;
  }
  if (isWriteTool && filePath) return filePath;
  if (tool.name === 'Read' && filePath) {
    const range = tool.input.offset ? ` :${tool.input.offset}` : '';
    return filePath + range;
  }
  if (tool.name === 'Bash' || tool.name === 'Bash Tool') return tool.input.description || tool.input.command || '';
  if (tool.name === 'Grep') return `/${tool.input.pattern || ''}/ ${tool.input.path || ''}`;
  if (tool.name === 'Glob') return tool.input.pattern || '';
  if (tool.name === 'Agent') return tool.input.description || tool.input.prompt?.slice(0, 80) || '';
  const vals = Object.values(tool.input);
  const firstStr = vals.find(v => typeof v === 'string');
  return typeof firstStr === 'string' ? firstStr.slice(0, 120) : '';
}

function ToolCallView({ tool, showDiff }: { tool: ToolCallSummary; showDiff: boolean }) {
  const isEditTool = tool.name === 'Edit' || tool.name === 'MultiEdit';
  const isWriteTool = tool.name === 'Write';
  const filePath = tool.input.file_path as string | undefined;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-zinc-800 bg-black/30">
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-zinc-900 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-zinc-500" /> : <ChevronRight className="h-3 w-3 text-zinc-500" />}
        <span className="text-xs font-medium text-zinc-400">{tool.name}</span>
        <span className="text-xs text-zinc-500 truncate">{getToolSummary(tool)}</span>
      </div>
      {expanded && (
        <div className="px-3 py-2 border-t border-zinc-800">
          <ToolCallFormatted input={tool.input} toolName={tool.name} />
        </div>
      )}
      {showDiff && isEditTool && tool.input.old_string !== undefined && (
        <div className="border-t border-zinc-800 px-3 py-2">
          {filePath && <div className="text-xs text-zinc-500 mb-1 font-[--font-mono]">{filePath}</div>}
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-xs text-red-400 mb-1">old</div>
              <pre className="text-xs p-2 overflow-x-auto font-[--font-mono] diff-old"><code>{tool.input.old_string}</code></pre>
            </div>
            <div className="flex items-center text-zinc-600">&rarr;</div>
            <div className="flex-1">
              <div className="text-xs text-green-400 mb-1">new</div>
              <pre className="text-xs p-2 overflow-x-auto font-[--font-mono] diff-new"><code>{tool.input.new_string}</code></pre>
            </div>
          </div>
        </div>
      )}
      {showDiff && isWriteTool && tool.input.content !== undefined && (
        <div className="border-t border-zinc-800 px-3 py-2">
          {filePath && <div className="text-xs text-zinc-500 mb-1 font-[--font-mono]">{filePath} (write)</div>}
          <pre className="text-xs p-2 overflow-x-auto font-[--font-mono] bg-zinc-900 border border-zinc-800"><code>{tool.input.content}</code></pre>
        </div>
      )}
    </div>
  );
}

function ToolCallFormatted({ input, toolName }: { input: Record<string, unknown>; toolName: string }) {
  const entries = Object.entries(input);

  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => {
        const isLongString = typeof value === 'string' && value.length > 60;
        const isCode = typeof value === 'string' && (
          key === 'command' || key === 'content' || key === 'old_string' ||
          key === 'new_string' || key === 'prompt' || key === 'pattern'
        );

        return (
          <div key={key} className="flex gap-2">
            <span className="text-xs text-zinc-500 shrink-0 font-[--font-mono]">{key}:</span>
            {isCode || isLongString ? (
              <pre className="text-xs text-zinc-300 overflow-x-auto font-[--font-mono] bg-black/30 p-1 flex-1 border border-zinc-800">
                <code>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</code>
              </pre>
            ) : (
              <span className="text-xs text-zinc-300">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </span>
            )}
          </div>
        );
      })}
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
    <div className="p-3 border-t border-border flex gap-2">
      <textarea
        ref={textareaRef}
        className="flex-1 bg-black/50 border border-input text-sm text-zinc-300 px-3 py-2 rounded-none resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-zinc-600 font-[inherit]"
        placeholder={sending ? 'claude is responding... (esc to cancel)' : 'send a message to this session... (enter to send)'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={sending}
        rows={2}
      />
      {sending ? (
        <Button variant="destructive" onClick={onCancel} className="self-end">
          <X className="h-4 w-4 mr-1" />
          cancel
        </Button>
      ) : (
        <Button variant="outline" onClick={handleSubmit} disabled={!text.trim()} className="self-end">
          <Send className="h-4 w-4 mr-1" />
          send
        </Button>
      )}
    </div>
  );
}
