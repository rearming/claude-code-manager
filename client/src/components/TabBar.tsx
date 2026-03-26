import { useState, useRef, useCallback, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { X, Minus } from 'lucide-react';
import type { SessionStore } from '../stores/SessionStore';

interface Props {
  store: SessionStore;
}

const DEFAULT_TAB_WIDTH = 200;
const MIN_TAB_WIDTH = 80;
const MAX_TAB_WIDTH = 600;

export const TabBar = observer(({ store }: Props) => {
  const visibleTabs = store.visibleTabs;
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Inline rename state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Resize state
  const resizingRef = useRef<{ sessionId: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    if (editingTabId) return;
    setDragTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
  }, [editingTabId]);

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(tabId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    if (dragTabId && dragTabId !== targetTabId) {
      store.moveTab(dragTabId, targetTabId);
    }
    setDragTabId(null);
    setDropTargetId(null);
  }, [store, dragTabId]);

  const handleDragEnd = useCallback(() => {
    setDragTabId(null);
    setDropTargetId(null);
  }, []);

  // Rename handlers
  const startRename = useCallback((tabId: string, currentTitle: string) => {
    setEditingTabId(tabId);
    setEditValue(currentTitle);
  }, []);

  const commitRename = useCallback(() => {
    if (!editingTabId) return;
    const tab = visibleTabs.find(t => t.tabId === editingTabId);
    if (tab?.sessionId) {
      store.renameSession(tab.sessionId, editValue);
    }
    setEditingTabId(null);
    setEditValue('');
  }, [editingTabId, editValue, store, visibleTabs]);

  const cancelRename = useCallback(() => {
    setEditingTabId(null);
    setEditValue('');
  }, []);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, sessionId: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { sessionId, startX: e.clientX, startWidth: currentWidth };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const newWidth = Math.max(MIN_TAB_WIDTH, Math.min(MAX_TAB_WIDTH, resizingRef.current.startWidth + delta));
      store.setTabWidth(resizingRef.current.sessionId, newWidth);
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [store]);

  if (visibleTabs.length === 0 && store.minimizedTabs.length === 0) return null;

  return (
    <div className="flex items-center border-b border-border bg-zinc-900/60 overflow-x-auto">
      <div className="flex items-center min-w-0 flex-1">
        {visibleTabs.map((tab) => {
          const isActive = tab.tabId === store.activeTabId;
          const isStreaming = tab.sending;
          const isDragging = dragTabId === tab.tabId;
          const isDropTarget = dropTargetId === tab.tabId && dragTabId !== tab.tabId;
          const isEditing = editingTabId === tab.tabId;
          const tabWidth = tab.sessionId ? (store.getTabWidth(tab.sessionId) ?? DEFAULT_TAB_WIDTH) : DEFAULT_TAB_WIDTH;

          return (
            <div
              key={tab.tabId}
              draggable={!isEditing}
              onDragStart={(e) => handleDragStart(e, tab.tabId)}
              onDragOver={(e) => handleDragOver(e, tab.tabId)}
              onDrop={(e) => handleDrop(e, tab.tabId)}
              onDragEnd={handleDragEnd}
              className={`group relative flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-border transition-all min-w-0 select-none ${
                isActive
                  ? 'bg-background text-zinc-200 border-b-2 border-b-zinc-400'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              } ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'border-l-2 border-l-zinc-400' : ''}`}
              style={{ width: tabWidth, maxWidth: tabWidth, flexShrink: 0 }}
              onClick={() => store.activateTab(tab.tabId)}
            >
              {isStreaming && (
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
              )}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  className="flex-1 min-w-0 bg-transparent border border-zinc-600 px-1 py-0 text-xs text-zinc-200 outline-none"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') cancelRename();
                  }}
                  onBlur={commitRename}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="truncate flex-1"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(tab.tabId, tab.title);
                  }}
                >
                  {tab.title}
                </span>
              )}
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isStreaming && (
                  <>
                    <button
                      className="p-0.5 hover:bg-zinc-700 rounded-sm text-zinc-500 hover:text-zinc-300"
                      onClick={(e) => { e.stopPropagation(); store.minimizeTab(tab.tabId); }}
                      title="minimize to tray"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <button
                      className="p-0.5 hover:bg-zinc-700 rounded-sm text-zinc-500 hover:text-zinc-300"
                      onClick={(e) => { e.stopPropagation(); store.closeTab(tab.tabId); }}
                      title="close tab"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
              {/* resize handle */}
              {tab.sessionId && (
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-zinc-500/50 z-10"
                  onMouseDown={(e) => handleResizeStart(e, tab.sessionId!, tabWidth)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
