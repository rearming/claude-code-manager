import { useState, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { X, Minus } from 'lucide-react';
import type { SessionStore } from '../stores/SessionStore';

interface Props {
  store: SessionStore;
}

export const TabBar = observer(({ store }: Props) => {
  const visibleTabs = store.visibleTabs;
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragStartIndex = useRef<number>(-1);

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string, index: number) => {
    setDragTabId(tabId);
    dragStartIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
    // Needed for Firefox
    e.dataTransfer.setData('text/plain', tabId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(tabId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, _tabId: string, dropIndex: number) => {
    e.preventDefault();
    if (dragStartIndex.current >= 0 && dragStartIndex.current !== dropIndex) {
      store.moveTab(dragStartIndex.current, dropIndex);
    }
    setDragTabId(null);
    setDropTargetId(null);
    dragStartIndex.current = -1;
  }, [store]);

  const handleDragEnd = useCallback(() => {
    setDragTabId(null);
    setDropTargetId(null);
    dragStartIndex.current = -1;
  }, []);

  if (visibleTabs.length === 0 && store.minimizedTabs.length === 0) return null;

  return (
    <div className="flex items-center border-b border-border bg-zinc-900/60 overflow-x-auto">
      <div className="flex items-center min-w-0 flex-1">
        {visibleTabs.map((tab, index) => {
          const isActive = tab.tabId === store.activeTabId;
          const isStreaming = tab.sending;
          const isDragging = dragTabId === tab.tabId;
          const isDropTarget = dropTargetId === tab.tabId && dragTabId !== tab.tabId;

          return (
            <div
              key={tab.tabId}
              draggable
              onDragStart={(e) => handleDragStart(e, tab.tabId, index)}
              onDragOver={(e) => handleDragOver(e, tab.tabId)}
              onDrop={(e) => handleDrop(e, tab.tabId, index)}
              onDragEnd={handleDragEnd}
              className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-border transition-all min-w-0 max-w-[200px] select-none ${
                isActive
                  ? 'bg-background text-zinc-200 border-b-2 border-b-zinc-400'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              } ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'border-l-2 border-l-zinc-400' : ''}`}
              onClick={() => store.activateTab(tab.tabId)}
            >
              {isStreaming && (
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
              )}
              <span className="truncate flex-1">{tab.title}</span>
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
            </div>
          );
        })}
      </div>
    </div>
  );
});
