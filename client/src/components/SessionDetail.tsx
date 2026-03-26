import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { observer } from 'mobx-react-lite';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.min.css';
import { ArrowLeft, GitFork, Copy, ChevronDown, ChevronRight, ArrowDown, X, Pencil, Download, ClipboardCopy, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/shadcn/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/shadcn/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import AnnotationCanvas from './AnnotationCanvas';
import { ChatInput } from './ChatInput';
import type { ChatInputHandle } from './ChatInput';
import type { DrawCommand } from './AnnotationCanvas';
import { cacheImage, saveAnnotatedImage } from '../api';
import type { SessionStore, StreamingToolCall, StreamingBlock } from '../stores/SessionStore';
import type { ConversationMessage, ToolCallSummary, ImageAttachment } from '../types';

interface Props {
  store: SessionStore;
}

export const SessionDetail = observer(({ store }: Props) => {
  const detail = store.selectedDetail;
  if (!detail) return null;

  const { summary, messages } = detail;
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const wasNearBottomRef = useRef(true);
  const isStale = useStaleStreamDetector(store);

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
      wasNearBottomRef.current = true;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    } else {
      const saved = store.getScrollPosition(summary.sessionId);
      if (saved !== undefined && saved.messageCount < messages.length) {
        wasNearBottomRef.current = true;
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
    const nearBottom = isNearBottom();
    wasNearBottomRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
    store.saveScrollPosition(summary.sessionId, el.scrollTop, messages.length);
  }, [store, summary.sessionId, isNearBottom, messages.length]);

  useEffect(() => {
    if (!store.sending || !store.settings.autoScrollOnNewMessages) return;
    const el = containerRef.current;
    if (el && wasNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [store.streamingText, store.streamingToolCalls.length, store.streamingBlocks.length, store.committedStreamingMessages.length, store.sending, store.settings.autoScrollOnNewMessages]);

  useEffect(() => {
    if (store.pendingUserMessage && store.settings.autoScrollOnNewMessages) {
      wasNearBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom(false));
    }
  }, [store.pendingUserMessage, store.settings.autoScrollOnNewMessages, scrollToBottom]);

  const messageInputRef = useRef<ChatInputHandle>(null);

  const handleResume = async () => {
    await store.resume(summary.sessionId);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleInsertImage = (attachment: ImageAttachment) => {
    messageInputRef.current?.addImageAttachment(attachment);
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

      {/* reconnection banner */}
      {store.reconnectedSessionId === summary.sessionId && (
        <div className="px-5 py-2 bg-green-900/20 border-b border-green-800/50 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-400">reconnected to active stream</span>
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
              onInsertImage={handleInsertImage}
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
              {store.pendingImages && store.pendingImages.length > 0 && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {store.pendingImages.map((img, i) => (
                    <img key={i} src={`data:${img.mediaType};base64,${img.data}`} alt={`attachment ${i + 1}`} className="max-h-48 max-w-xs border border-border" />
                  ))}
                </div>
              )}
              <div className="text-sm text-zinc-300">{store.pendingUserMessage}</div>
            </div>
          )}

          {/* Committed messages from completed turns during multi-turn streaming */}
          {store.committedStreamingMessages.map((msg, index) => (
            <MessageBubble
              key={msg.uuid}
              message={msg}
              messageIndex={messages.length + index}
              totalMessages={messages.length + store.committedStreamingMessages.length}
              onFork={handleFork}
              onInsertImage={handleInsertImage}
              forking={store.forking}
              globalExpand={store.settings.globalExpandTools}
              globalDiffs={store.settings.globalShowDiffs}
            />
          ))}

          {/* Current streaming turn (in-progress) */}
          {store.streamingBlocks.length > 0 ? (
            <StreamingBlocksView blocks={store.streamingBlocks} sending={store.sending} />
          ) : store.streamingText ? (
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
          ) : null}

          {store.sending && !store.streamingText && store.streamingBlocks.length === 0 && (
            <div className="p-4 border border-border bg-assistant-bg mr-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">claude</span>
                <span className="text-xs text-zinc-500 animate-pulse">
                  {store.committedStreamingMessages.length > 0 ? 'working...' : 'thinking...'}
                </span>
              </div>
              {store.committedStreamingMessages.length === 0 && (
                <div className="text-sm text-zinc-500">waiting for response...</div>
              )}
            </div>
          )}

          {isStale && (
            <div className="p-3 border border-yellow-800 bg-yellow-900/20 mx-6 mt-2">
              <div className="text-xs text-yellow-400">
                no events received for 30s — the session may be waiting for permission approval or is stalled.
              </div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => store.cancelSend()}>cancel</Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => {
                  store.cancelSend();
                  store.reloadSession(summary.sessionId);
                }}>cancel &amp; reload</Button>
              </div>
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
        ref={messageInputRef}
        sessionId={summary.sessionId}
        onSend={(msg, images) => store.sendMessage(summary.sessionId, msg, images)}
        sending={store.sending}
        onCancel={() => store.cancelSend()}
      />
    </div>
  );
});

function useStaleStreamDetector(store: SessionStore): boolean {
  const [isStale, setIsStale] = useState(false);
  useEffect(() => {
    if (!store.sending) {
      setIsStale(false);
      return;
    }
    const interval = setInterval(() => {
      if (store.sending && store.lastRawEventTime > 0) {
        setIsStale(Date.now() - store.lastRawEventTime > 30_000);
      }
    }, 5_000);
    return () => clearInterval(interval);
  }, [store, store.sending]);
  return isStale;
}

function getStreamingToolSummary(tc: StreamingToolCall): string {
  const input = tc.input;
  const filePath = input.file_path as string | undefined;
  if ((tc.name === 'Edit' || tc.name === 'MultiEdit' || tc.name === 'Write' || tc.name === 'Read') && filePath) return filePath;
  if (tc.name === 'Bash' || tc.name === 'Bash Tool') return (input.description || input.command || '') as string;
  if (tc.name === 'Grep') return `/${input.pattern || ''}/ ${input.path || ''}`;
  if (tc.name === 'Glob') return (input.pattern || '') as string;
  if (tc.name === 'Agent') return (input.description || '') as string;
  const vals = Object.values(input);
  const firstStr = vals.find(v => typeof v === 'string');
  return typeof firstStr === 'string' ? firstStr.slice(0, 80) : '';
}

const StreamingBlocksView = observer(({ blocks, sending }: { blocks: StreamingBlock[]; sending: boolean }) => {
  // Group consecutive tool_use blocks together for compact display
  const groups: Array<{ type: 'text'; text: string } | { type: 'tools'; tools: StreamingBlock[] }> = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      if (block.text) {
        groups.push({ type: 'text', text: block.text });
      }
    } else {
      const last = groups[groups.length - 1];
      if (last && last.type === 'tools') {
        last.tools.push(block);
      } else {
        groups.push({ type: 'tools', tools: [block] });
      }
    }
  }

  return (
    <>
      {groups.map((group, i) => {
        if (group.type === 'text') {
          return (
            <div key={`text-${i}`} className="p-4 border border-border bg-assistant-bg mr-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">claude</span>
                {sending && i === groups.length - 1 && <span className="text-xs text-green-500 animate-pulse">streaming...</span>}
              </div>
              <div className="text-sm text-zinc-300 markdown-body">
                <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {group.text}
                </Markdown>
              </div>
            </div>
          );
        }
        const toolCalls = group.tools.filter((b): b is Extract<StreamingBlock, { type: 'tool_use' }> => b.type === 'tool_use');
        return (
          <StreamingToolCallsView key={`tools-${i}`} toolCalls={toolCalls} />
        );
      })}
    </>
  );
});

function StreamingToolCallsView({ toolCalls }: { toolCalls: StreamingToolCall[] }) {
  return (
    <div className="p-4 border border-border bg-assistant-bg mx-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">tool calls</span>
        <span className="text-xs text-zinc-500">{toolCalls.filter(tc => tc.status === 'running').length} running</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {toolCalls.map((tc, i) => (
          <span
            key={tc.id || i}
            className={`inline-flex items-center gap-1.5 text-xs border px-2 py-1 ${
              tc.status === 'running'
                ? 'border-green-800 bg-green-900/20 text-green-400'
                : 'border-zinc-700 bg-black/30 text-zinc-500'
            }`}
          >
            {tc.status === 'running' && (
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
            <span className="font-medium">{tc.name}</span>
            <span className="truncate max-w-[250px] opacity-75">{getStreamingToolSummary(tc)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: ConversationMessage;
  messageIndex: number;
  totalMessages: number;
  onFork: (uuid: string) => void;
  onInsertImage: (attachment: ImageAttachment) => void;
  forking: boolean;
  globalExpand: boolean;
  globalDiffs: boolean;
}

function MessageBubble({ message, messageIndex, totalMessages, onFork, onInsertImage, forking, globalExpand, globalDiffs }: MessageBubbleProps) {
  const [localExpand, setLocalExpand] = useState<boolean | null>(null);
  const [localDiffs, setLocalDiffs] = useState<boolean | null>(null);
  const [confirmFork, setConfirmFork] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; mediaType: string; data: string } | null>(null);
  const [annotating, setAnnotating] = useState(false);
  const [annotatedSrc, setAnnotatedSrc] = useState<string | null>(null);
  const [annotationCommands, setAnnotationCommands] = useState<DrawCommand[]>([]);
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

      {/* images */}
      {message.images && message.images.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {message.images.map((img, i) => {
            const src = `data:${img.mediaType};base64,${img.data}`;
            return (
              <img
                key={i}
                src={src}
                alt={`attachment ${i + 1}`}
                className="max-h-48 max-w-xs border border-border cursor-pointer hover:border-zinc-400 transition-colors"
                onClick={() => setPreviewImage({ src, mediaType: img.mediaType, data: img.data })}
              />
            );
          })}
        </div>
      )}

      {/* image preview dialog */}
      {previewImage && !annotating && (
        <Dialog open onOpenChange={(open) => { if (!open) { setPreviewImage(null); setAnnotatedSrc(null); setAnnotationCommands([]); } }}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-zinc-700" withCloseButton={false}>
            <VisuallyHidden><DialogTitle>Image Preview</DialogTitle></VisuallyHidden>
            <div className="relative flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 bg-black/80">
                {annotatedSrc && (
                  <span className="text-xs text-green-500 mr-1">annotated</span>
                )}
                <div className="flex-1" />
                {annotatedSrc && (
                  <>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors rounded-none"
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = annotatedSrc;
                        a.download = `annotated-${Date.now()}.png`;
                        a.click();
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      download
                    </button>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors rounded-none"
                      onClick={async () => {
                        try {
                          const res = await fetch(annotatedSrc);
                          const blob = await res.blob();
                          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                        } catch (e) {
                          console.error('Failed to copy to clipboard:', e);
                        }
                      }}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      copy
                    </button>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors rounded-none"
                      onClick={() => {
                        const base64 = annotatedSrc.split(',')[1];
                        onInsertImage({ mediaType: 'image/png', data: base64 });
                        setPreviewImage(null);
                        setAnnotatedSrc(null);
                        setAnnotationCommands([]);
                      }}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      insert into chat
                    </button>
                  </>
                )}
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors rounded-none"
                  onClick={() => { setAnnotatedSrc(null); setAnnotating(true); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {annotatedSrc ? 're-annotate' : 'annotate'}
                </button>
                <button
                  className="flex items-center justify-center w-7 h-7 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors rounded-none"
                  onClick={() => { setPreviewImage(null); setAnnotatedSrc(null); setAnnotationCommands([]); }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center justify-center p-4 bg-black/50 overflow-auto">
                <img
                  src={annotatedSrc || previewImage.src}
                  alt="preview"
                  className="max-w-full max-h-[80vh] border border-zinc-800"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* annotation editor (full-screen overlay) */}
      {previewImage && annotating && (
        <AnnotationCanvas
          imageSrc={previewImage.src}
          initialCommands={annotationCommands}
          onSave={async (annotatedDataUrl, commands) => {
            try {
              const cached = await cacheImage(previewImage.data, previewImage.mediaType);
              const annotatedBase64 = annotatedDataUrl.split(',')[1];
              await saveAnnotatedImage(annotatedBase64, 'image/png', cached.hash);
            } catch (e) {
              console.error('Failed to save annotation:', e);
            }
            setAnnotatedSrc(annotatedDataUrl);
            setAnnotationCommands(commands);
            setAnnotating(false);
          }}
          onClose={() => setAnnotating(false)}
        />
      )}

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
                <ToolCallView key={i} tool={tc} showDiff={showDiffs} forceExpand={showTools} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* subagent tool calls */}
      {message.subagentToolCalls && message.subagentToolCalls.length > 0 && (
        <SubagentToolCallsView toolCalls={message.subagentToolCalls} forceExpand={showTools} />
      )}
    </div>
  );
}

function SubagentToolCallsView({ toolCalls, forceExpand }: { toolCalls: ToolCallSummary[]; forceExpand: boolean }) {
  const [localExpand, setLocalExpand] = useState<boolean | null>(null);
  const prevForceRef = useRef(forceExpand);
  if (prevForceRef.current !== forceExpand) {
    prevForceRef.current = forceExpand;
    if (localExpand !== null) setLocalExpand(null);
  }
  const expanded = localExpand !== null ? localExpand : forceExpand;
  return (
    <div className="mt-2 border-t border-zinc-800 pt-2">
      <button
        className={`text-xs flex items-center gap-1 px-2 py-0.5 border transition-colors ${
          expanded ? 'border-zinc-600 text-zinc-300 bg-zinc-800' : 'border-border text-zinc-500 hover:text-zinc-300'
        }`}
        onClick={() => setLocalExpand(localExpand === null ? !forceExpand : !localExpand)}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {toolCalls.length} subagent tool call{toolCalls.length > 1 ? 's' : ''}
      </button>
      {expanded ? (
        <div className="mt-2 space-y-1 ml-3 border-l-2 border-zinc-800 pl-2">
          {toolCalls.map((tc, i) => (
            <ToolCallView key={i} tool={tc} showDiff={false} forceExpand={forceExpand} />
          ))}
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1 ml-3">
          {toolCalls.map((tc, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs border border-zinc-800 px-1.5 py-0.5 bg-black/20">
              <span className="text-zinc-500 font-medium">{tc.name}</span>
              <span className="text-zinc-600 truncate max-w-[180px]">{getToolSummary(tc)}</span>
            </span>
          ))}
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

function ToolCallView({ tool, showDiff, forceExpand }: { tool: ToolCallSummary; showDiff: boolean; forceExpand?: boolean }) {
  const isEditTool = tool.name === 'Edit' || tool.name === 'MultiEdit';
  const isWriteTool = tool.name === 'Write';
  const filePath = tool.input.file_path as string | undefined;
  const [localExpand, setLocalExpand] = useState<boolean | null>(null);
  const prevForceRef = useRef(forceExpand);
  if (prevForceRef.current !== forceExpand) {
    prevForceRef.current = forceExpand;
    if (localExpand !== null) setLocalExpand(null);
  }
  const expanded = localExpand !== null ? localExpand : (forceExpand ?? false);

  return (
    <div className="border border-zinc-800 bg-black/30">
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-zinc-900 transition-colors"
        onClick={() => setLocalExpand(localExpand === null ? !(forceExpand ?? false) : !localExpand)}
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
  onSend: (message: string, images?: ImageAttachment[]) => void;
  onCancel: () => void;
  sending: boolean;
  sessionId: string;
}

const DRAFT_CACHE_KEY = 'ccm-chat-drafts';

function getDraftCache(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(DRAFT_CACHE_KEY) || '{}'); } catch { return {}; }
}

function setDraftCache(sessionId: string, text: string) {
  const cache = getDraftCache();
  if (text) { cache[sessionId] = text; } else { delete cache[sessionId]; }
  localStorage.setItem(DRAFT_CACHE_KEY, JSON.stringify(cache));
}

const MessageInput = forwardRef<ChatInputHandle, MessageInputProps>(function MessageInput({ onSend, onCancel, sending, sessionId }, ref) {
  const [text, setText] = useState(() => getDraftCache()[sessionId] || '');
  const prevSessionIdRef = useRef(sessionId);
  if (prevSessionIdRef.current !== sessionId) {
    prevSessionIdRef.current = sessionId;
    setText(getDraftCache()[sessionId] || '');
  }

  const handleChange = (val: string) => {
    setText(val);
    setDraftCache(sessionId, val);
  };

  const handleSubmit = (message: string, images?: ImageAttachment[]) => {
    onSend(message, images);
    setText('');
    setDraftCache(sessionId, '');
  };

  return (
    <div className="p-3 border-t border-border">
      <ChatInput
        ref={ref}
        value={text}
        onChange={handleChange}
        onSubmit={handleSubmit}
        onCancel={onCancel}
        sending={sending}
        placeholder={sending ? 'claude is responding... (esc to cancel)' : 'send a message... (paste/drop images, enter to send)'}
      />
    </div>
  );
});
