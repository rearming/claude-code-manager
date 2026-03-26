import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ChevronUp, Maximize2, X } from 'lucide-react';
import type { SessionStore } from '../stores/SessionStore';

interface Props {
  store: SessionStore;
}

export const TabTray = observer(({ store }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const minimized = store.minimizedTabs;

  if (minimized.length === 0) return null;

  return (
    <div className="relative">
      {/* Tray trigger */}
      <button
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 border border-border hover:border-zinc-600 bg-zinc-900/50"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronUp className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        {minimized.length} minimized
      </button>

      {/* Expanded tray popover */}
      {expanded && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
          <div className="absolute bottom-full left-0 mb-1 z-50 bg-zinc-900 border border-border shadow-xl min-w-[200px] max-w-[300px]">
            <div className="px-3 py-2 border-b border-border text-xs font-bold text-zinc-400 uppercase tracking-wider">
              minimized tabs
            </div>
            {minimized.map((tab) => (
              <div
                key={tab.tabId}
                className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 cursor-pointer transition-colors group"
                onClick={() => { store.restoreTab(tab.tabId); setExpanded(false); }}
              >
                {tab.sending && (
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                )}
                <span className="truncate flex-1">{tab.title}</span>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="p-0.5 hover:bg-zinc-700 rounded-sm text-zinc-500 hover:text-zinc-300"
                    onClick={(e) => { e.stopPropagation(); store.restoreTab(tab.tabId); setExpanded(false); }}
                    title="restore"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </button>
                  <button
                    className="p-0.5 hover:bg-zinc-700 rounded-sm text-zinc-500 hover:text-zinc-300"
                    onClick={(e) => { e.stopPropagation(); store.closeTab(tab.tabId); }}
                    title="close"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
