import { useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Plus, Terminal, Settings, ChevronDown, ChevronRight, Diff, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/shadcn/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/shadcn/ui/tooltip';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle, usePanelRef } from '@/components/shadcn/ui/resizable';
import type { SessionStore } from '../stores/SessionStore';
import type { TabSession } from '../stores/TabSession';
import { SearchBar } from './SearchBar';
import { SessionList } from './SessionList';
import { SessionDetail } from './SessionDetail';
import { SettingsPanel } from './SettingsPanel';
import { NewSessionDialog } from './NewSessionDialog';
import { TerminalPanel } from './TerminalPanel';
import { TabBar } from './TabBar';
import { TabTray } from './TabTray';
import { DraftPanel } from './DraftPanel';

interface Props {
  store: SessionStore;
}

export const Layout = observer(({ store }: Props) => {
  const activeTab = store.activeTab;
  const showNewSessionStreaming = activeTab && !activeTab.selectedDetail && !!(activeTab.sending || activeTab.streamingText);
  const sidebarPanelRef = usePanelRef();
  const chatPanelRef = usePanelRef();
  const terminalPanelRef = usePanelRef();
  const layout = store.panelLayout;

  const handleLayoutChanged = useCallback((layoutMap: { [id: string]: number }) => {
    store.setPanelLayout({
      sidebarSize: layoutMap['sidebar'] ?? layout.sidebarSize,
      chatSize: layoutMap['chat'] ?? layout.chatSize,
      ...(layoutMap['terminal'] !== undefined ? { terminalSize: layoutMap['terminal'] } : {}),
    });
  }, [store, layout]);

  const handleSidebarResize = useCallback((size: { asPercentage: number }) => {
    store.setSidebarCollapsed(size.asPercentage === 0);
  }, [store]);

  const handleChatResize = useCallback((size: { asPercentage: number }) => {
    store.setChatCollapsed(size.asPercentage === 0);
  }, [store]);

  const handleTerminalResize = useCallback((size: { asPercentage: number }) => {
    store.setTerminalCollapsed(size.asPercentage === 0);
  }, [store]);

  const toggleSidebarCollapse = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, [sidebarPanelRef]);

  const toggleChatCollapse = useCallback(() => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, [chatPanelRef]);

  const toggleTerminalCollapse = useCallback(() => {
    const panel = terminalPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, [terminalPanelRef]);

  const sidebarPctNoTerminal = layout.sidebarSize / (layout.sidebarSize + layout.chatSize) * 100;
  const chatPctNoTerminal = layout.chatSize / (layout.sidebarSize + layout.chatSize) * 100;

  const chatPanel = (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      <TabBar store={store} />
      <main className="flex-1 overflow-hidden">
        <MainContent store={store} activeTab={activeTab} showNewSessionStreaming={!!showNewSessionStreaming} />
      </main>
      <BottomToolbar
        store={store}
        showTerminal={store.showTerminal}
        toggleSidebarCollapse={toggleSidebarCollapse}
        toggleChatCollapse={store.showTerminal ? toggleChatCollapse : undefined}
        toggleTerminalCollapse={store.showTerminal ? toggleTerminalCollapse : undefined}
      />
    </div>
  );

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        {store.showTerminal ? (
          <ResizablePanelGroup
            orientation="horizontal"
            onLayoutChanged={handleLayoutChanged}
            className="flex-1"
          >
            <ResizablePanel
              id="sidebar"
              panelRef={sidebarPanelRef}
              defaultSize={layout.sidebarSize}
              minSize={10}
              collapsible
              collapsedSize={0}
              onResize={handleSidebarResize}
            >
              <Sidebar store={store} />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel
              id="chat"
              panelRef={chatPanelRef}
              defaultSize={layout.chatSize}
              minSize={15}
              collapsible
              collapsedSize={0}
              onResize={handleChatResize}
              className="flex flex-col min-w-0"
            >
              {chatPanel}
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel
              id="terminal"
              panelRef={terminalPanelRef}
              defaultSize={layout.terminalSize}
              minSize={15}
              collapsible
              collapsedSize={0}
              onResize={handleTerminalResize}
              className="flex flex-col min-w-0"
            >
              <TerminalPanel store={store} tab={activeTab} />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <ResizablePanelGroup
            orientation="horizontal"
            onLayoutChanged={(layoutMap) => {
              store.setPanelLayout({
                sidebarSize: layoutMap['sidebar'] ?? layout.sidebarSize,
                chatSize: layoutMap['chat'] ?? layout.chatSize,
              });
            }}
            className="flex-1"
          >
            <ResizablePanel
              id="sidebar"
              panelRef={sidebarPanelRef}
              defaultSize={sidebarPctNoTerminal}
              minSize={10}
              collapsible
              collapsedSize={0}
              onResize={handleSidebarResize}
            >
              <Sidebar store={store} />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel
              id="chat"
              panelRef={chatPanelRef}
              defaultSize={chatPctNoTerminal}
              minSize={15}
              collapsible
              collapsedSize={0}
              onResize={handleChatResize}
              className="flex flex-col min-w-0"
            >
              {chatPanel}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}

        <SettingsPanel store={store} />
        <NewSessionDialog store={store} />
      </div>
    </TooltipProvider>
  );
});

const Sidebar = observer(({ store }: { store: SessionStore }) => (
  <aside className="bg-zinc-900/40 border-r border-border flex flex-col overflow-hidden h-full">
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
    <DraftPanel store={store} />
    <SessionList store={store} />
  </aside>
));

const MainContent = observer(({ store, activeTab, showNewSessionStreaming }: { store: SessionStore; activeTab: TabSession | null; showNewSessionStreaming: boolean }) => {
  if (activeTab?.selectedDetail) return <SessionDetail key={activeTab.tabId} store={store} tab={activeTab} />;
  if (activeTab && showNewSessionStreaming) return <NewSessionStreamingView key={activeTab.tabId} store={store} tab={activeTab} />;
  if (activeTab?.detailLoading) return <div className="flex items-center justify-center h-full text-zinc-500">loading conversation...</div>;
  return <EmptyState />;
});

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
    <span className="text-4xl opacity-30">&#x1F4AC;</span>
    <h2 className="text-lg text-zinc-400">select a session</h2>
    <p className="text-sm">choose a conversation from the sidebar to view it here</p>
  </div>
);

interface BottomToolbarProps {
  store: SessionStore;
  showTerminal: boolean;
  toggleSidebarCollapse: () => void;
  toggleChatCollapse?: () => void;
  toggleTerminalCollapse?: () => void;
}

const BottomToolbar = observer(({ store, showTerminal, toggleSidebarCollapse, toggleChatCollapse, toggleTerminalCollapse }: BottomToolbarProps) => {
  const { sidebarCollapsed, chatCollapsed, terminalCollapsed } = store.panelLayout;
  const activeTab = store.activeTab;

  return (
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={toggleSidebarCollapse}>
              {sidebarCollapsed ? <PanelLeftOpen className="h-3 w-3" /> : <PanelLeftClose className="h-3 w-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sidebarCollapsed ? 'expand sidebar' : 'collapse sidebar'}</TooltipContent>
        </Tooltip>
        {showTerminal && toggleChatCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={toggleChatCollapse}>
                {chatCollapsed ? <PanelLeftOpen className="h-3 w-3" /> : <PanelLeftClose className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{chatCollapsed ? 'expand chat' : 'collapse chat'}</TooltipContent>
          </Tooltip>
        )}
        {showTerminal && toggleTerminalCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={toggleTerminalCollapse}>
                {terminalCollapsed ? <PanelRightOpen className="h-3 w-3" /> : <PanelRightClose className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{terminalCollapsed ? 'expand terminal' : 'collapse terminal'}</TooltipContent>
          </Tooltip>
        )}
        <TabTray store={store} />
      </div>
      <div className="text-zinc-500">
        {activeTab?.selectedDetail && (
          <span>
            {activeTab.selectedDetail.messages.length} messages
            {activeTab.selectedDetail.messages.reduce((sum, m) => sum + (m.toolCalls?.length || 0), 0) > 0 &&
              ` · ${activeTab.selectedDetail.messages.reduce((sum, m) => sum + (m.toolCalls?.length || 0), 0)} tool calls`
            }
          </span>
        )}
      </div>
    </div>
  );
});

const NewSessionStreamingView = observer(({ store, tab }: { store: SessionStore; tab: TabSession }) => (
  <div className="flex flex-col h-full">
    <div className="px-5 py-4 border-b border-border">
      <h2 className="text-lg text-zinc-200">new session</h2>
      <span className="text-sm text-zinc-500">starting...</span>
    </div>
    <div className="flex-1 overflow-y-auto p-4">
      {tab.pendingUserMessage && (
        <div className="mb-4 p-4 border border-border bg-user-bg">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">you</span>
            <span className="text-xs text-zinc-500">just now</span>
          </div>
          <div className="text-sm text-zinc-300">{tab.pendingUserMessage}</div>
        </div>
      )}

      {tab.committedStreamingMessages.map((msg) => (
        <div key={msg.uuid} className="p-4 border border-border bg-assistant-bg mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">claude</span>
            {msg.model && <span className="text-xs text-zinc-500">{msg.model}</span>}
          </div>
          {msg.content && (
            <div className="text-sm text-zinc-300 markdown-body">
              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {msg.content}
              </Markdown>
            </div>
          )}
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {msg.toolCalls.map((tc, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-xs border border-zinc-700 bg-black/30 text-zinc-500 px-2 py-1">
                  <span className="font-medium">{tc.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {tab.streamingText ? (
        <div className="p-4 border border-border bg-assistant-bg">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">claude</span>
            <span className="text-xs text-green-500 animate-pulse">streaming...</span>
          </div>
          <div className="text-sm text-zinc-300 markdown-body">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {tab.streamingText}
            </Markdown>
          </div>
        </div>
      ) : tab.streamingToolCalls.length === 0 && tab.committedStreamingMessages.length === 0 ? (
        <div className="p-4 border border-border bg-assistant-bg">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">claude</span>
            <span className="text-xs text-zinc-500 animate-pulse">thinking...</span>
          </div>
          <div className="text-sm text-zinc-500">waiting for response...</div>
        </div>
      ) : null}
      {tab.sending && tab.streamingToolCalls.length > 0 && (
        <div className="p-4 border border-border bg-assistant-bg mt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">tool calls</span>
            <span className="text-xs text-zinc-500">{tab.streamingToolCalls.filter(tc => tc.status === 'running').length} running</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tab.streamingToolCalls.map((tc, i) => (
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
      <Button variant="destructive" onClick={() => tab.cancelSend()}>cancel</Button>
    </div>
  </div>
));
