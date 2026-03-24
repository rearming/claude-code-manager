import { observer } from 'mobx-react-lite';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Plus, Terminal, Settings, ChevronDown, ChevronRight, Diff } from 'lucide-react';
import { Button } from '@/components/shadcn/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/shadcn/ui/tooltip';
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
  const showNewSessionStreaming = !store.selectedDetail && (store.sending || store.streamingText);

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        {/* sidebar */}
        <aside className="w-[380px] min-w-[380px] bg-zinc-900/40 border-r border-border flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h1 className="text-base font-bold text-zinc-200">claude code manager</h1>
            <div className="flex gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="default" onClick={() => store.openNewSession()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>new session</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={store.showTerminal ? 'default' : 'outline'}
                    onClick={() => store.toggleTerminal()}
                  >
                    <Terminal className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>raw terminal</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" onClick={() => store.toggleSettings()}>
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>settings</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <SearchBar store={store} />
          <SessionList store={store} />
        </aside>

        {/* main content */}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 overflow-hidden">
            {store.selectedDetail ? (
              <SessionDetail store={store} />
            ) : showNewSessionStreaming ? (
              <div className="flex flex-col h-full">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-lg text-zinc-200">new session</h2>
                  <span className="text-sm text-zinc-500">starting...</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {store.pendingUserMessage && (
                    <div className="mb-4 p-4 border border-border bg-user-bg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">you</span>
                        <span className="text-xs text-zinc-500">just now</span>
                      </div>
                      <div className="text-sm text-zinc-300">{store.pendingUserMessage}</div>
                    </div>
                  )}
                  {store.streamingText ? (
                    <div className="p-4 border border-border bg-assistant-bg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">claude</span>
                        <span className="text-xs text-green-500 animate-pulse">streaming...</span>
                      </div>
                      <div className="text-sm text-zinc-300 markdown-body">
                        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                          {store.streamingText}
                        </Markdown>
                      </div>
                    </div>
                  ) : store.streamingToolCalls.length === 0 ? (
                    <div className="p-4 border border-border bg-assistant-bg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">claude</span>
                        <span className="text-xs text-zinc-500 animate-pulse">thinking...</span>
                      </div>
                      <div className="text-sm text-zinc-500">waiting for response...</div>
                    </div>
                  ) : null}
                  {store.sending && store.streamingToolCalls.length > 0 && (
                    <div className="p-4 border border-border bg-assistant-bg mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">tool calls</span>
                        <span className="text-xs text-zinc-500">{store.streamingToolCalls.filter(tc => tc.status === 'running').length} running</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {store.streamingToolCalls.map((tc, i) => (
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
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-3 border-t border-border">
                  <Button variant="destructive" onClick={() => store.cancelSend()}>cancel</Button>
                </div>
              </div>
            ) : store.detailLoading ? (
              <div className="flex items-center justify-center h-full text-zinc-500">loading conversation...</div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                <span className="text-4xl opacity-30">&#x1F4AC;</span>
                <h2 className="text-lg text-zinc-400">select a session</h2>
                <p className="text-sm">choose a conversation from the sidebar to view it here</p>
              </div>
            )}
          </main>

          {/* bottom toolbar */}
          <div className="px-4 py-2 border-t border-border bg-secondary flex items-center justify-between text-xs">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={store.settings.globalExpandTools ? 'default' : 'outline'}
                onClick={() => store.toggleGlobalExpandTools()}
              >
                {store.settings.globalExpandTools ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                tools
              </Button>
              <Button
                size="sm"
                variant={store.settings.globalShowDiffs ? 'default' : 'outline'}
                onClick={() => store.toggleGlobalShowDiffs()}
              >
                <Diff className="h-3 w-3 mr-1" />
                diffs
              </Button>
            </div>
            <div className="text-zinc-500">
              {store.selectedDetail && (
                <span>
                  {store.selectedDetail.messages.length} messages
                  {store.selectedDetail.messages.reduce((sum, m) => sum + (m.toolCalls?.length || 0), 0) > 0 &&
                    ` · ${store.selectedDetail.messages.reduce((sum, m) => sum + (m.toolCalls?.length || 0), 0)} tool calls`
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
    </TooltipProvider>
  );
});
