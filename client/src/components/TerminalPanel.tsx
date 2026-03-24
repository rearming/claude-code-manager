import { useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { X, Trash2, Send } from 'lucide-react';
import { Button } from '@/components/shadcn/ui/button';
import type { SessionStore } from '../stores/SessionStore';

interface Props {
  store: SessionStore;
}

export const TerminalPanel = observer(({ store }: Props) => {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = outputRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [store.rawLines.length]);

  const handleSend = () => {
    const trimmed = store.terminalInput.trim();
    if (!trimmed || !store.selectedSessionId || store.sending) return;
    store.sendMessage(store.selectedSessionId, trimmed);
    store.setTerminalInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-background flex flex-col h-full">
      {/* header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-sm font-bold text-zinc-300">raw terminal</span>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => store.clearRawLines()} title="clear">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => store.toggleTerminal()} title="close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* output */}
      <div className="flex-1 overflow-y-auto font-[--font-mono] text-xs p-2" ref={outputRef}>
        {store.rawLines.length === 0 ? (
          <div className="p-4 text-zinc-500 text-center">
            raw json stream will appear here when you send a message...
          </div>
        ) : (
          store.rawLines.map((line, i) => (
            <div key={i} className="flex gap-2 py-0.5 hover:bg-zinc-900 transition-colors">
              <span className="text-zinc-600 select-none w-8 text-right shrink-0">{i + 1}</span>
              <pre className="text-zinc-400 whitespace-pre-wrap break-all flex-1">{formatJson(line)}</pre>
            </div>
          ))
        )}
      </div>

      {/* input */}
      <div className="p-2 border-t border-border flex gap-2">
        <textarea
          className="flex-1 bg-black/50 border border-input text-xs text-zinc-300 px-2 py-1.5 rounded-none resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-zinc-600 font-[--font-mono]"
          placeholder={store.sending ? 'streaming...' : 'send raw message...'}
          value={store.terminalInput}
          onChange={(e) => store.setTerminalInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={store.sending || !store.selectedSessionId}
          rows={2}
        />
        <Button
          size="icon"
          variant="outline"
          onClick={handleSend}
          disabled={!store.terminalInput.trim() || store.sending || !store.selectedSessionId}
          className="self-end"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
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
