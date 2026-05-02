import { observer } from 'mobx-react-lite';
import { useState, useRef, useEffect } from 'react';
import { X, Bell, Plus, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/shadcn/ui/button';
import { Switch } from '@/components/shadcn/ui/switch';
import { Input } from '@/components/shadcn/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/ui/select';
import type { SessionStore, QuickSwitchModel, ModelConfig } from '../stores/SessionStore';

interface Props {
  store: SessionStore;
}

export const SettingsPanel = observer(({ store }: Props) => {
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(
    store.notificationPermission
  );

  if (!store.showSettings) return null;

  const handleNotificationToggle = async (checked: boolean) => {
    if (checked && permissionState === 'default') {
      const result = await store.requestNotificationPermission();
      setPermissionState(result);
      if (result === 'granted') {
        store.setNotifyOnStreamEnd(true);
      }
    } else if (checked && permissionState === 'granted') {
      store.setNotifyOnStreamEnd(true);
    } else {
      store.setNotifyOnStreamEnd(false);
    }
  };

  const notificationsBlocked = permissionState === 'denied';
  const notificationsUnsupported = permissionState === 'unsupported';

  return (
    <div className="fixed inset-0 z-50 bg-black/70" onClick={() => store.toggleSettings()}>
      <div
        className="absolute right-0 top-0 h-full w-[400px] bg-background border-l border-border p-6 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6 shrink-0">
          <h3 className="text-lg font-bold text-zinc-200">settings</h3>
          <Button size="icon" variant="ghost" onClick={() => store.toggleSettings()}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-6 overflow-y-auto flex-1 min-h-0 pr-1">
          <div className="flex items-start gap-3">
            <Switch
              checked={store.settings.autoScrollOnNewMessages}
              onCheckedChange={(checked) => store.setAutoScroll(checked)}
            />
            <div>
              <div className="text-sm text-zinc-200">auto-scroll on new messages</div>
              <p className="text-xs text-zinc-500 mt-1">
                automatically scroll to the bottom when new messages arrive or during streaming responses.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              checked={store.settings.dangerouslySkipPermissions}
              onCheckedChange={(checked) => store.setDangerouslySkipPermissions(checked)}
            />
            <div>
              <div className="text-sm text-zinc-200">auto-approve tool calls</div>
              <p className="text-xs text-zinc-500 mt-1">
                skip permission prompts for all tool calls (--dangerously-skip-permissions).
                required for sending messages from this ui since there is no approval interface.
                only use in trusted environments.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              checked={store.settings.notifyOnStreamEnd && permissionState === 'granted'}
              onCheckedChange={handleNotificationToggle}
              disabled={notificationsBlocked || notificationsUnsupported}
            />
            <div>
              <div className="text-sm text-zinc-200 flex items-center gap-2">
                <Bell className="h-3.5 w-3.5" />
                notify when stream ends
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {notificationsUnsupported
                  ? 'notifications not supported in this browser.'
                  : notificationsBlocked
                    ? 'notifications blocked. enable in browser settings.'
                    : 'show a system notification when claude finishes responding. works across all apps.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              checked={store.settings.includeFileMentionContent}
              onCheckedChange={(checked) => store.setIncludeFileMentionContent(checked)}
            />
            <div>
              <div className="text-sm text-zinc-200">include file text with @mentions</div>
              <p className="text-xs text-zinc-500 mt-1">
                when you @mention a file, append its full contents in xml tags after the message.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              checked={store.settings.collapseFileMentions}
              onCheckedChange={(checked) => store.setCollapseFileMentions(checked)}
            />
            <div>
              <div className="text-sm text-zinc-200">collapse file mention blocks</div>
              <p className="text-xs text-zinc-500 mt-1">
                hide @mentioned file contents behind a collapsible toggle in the chat.
              </p>
            </div>
          </div>

          <div className="border-t border-zinc-700 pt-4">
            <h4 className="text-sm font-bold text-zinc-300 mb-3">model config (global defaults)</h4>
            <p className="text-xs text-zinc-500 mb-4">
              these are the default model settings for all chats. individual chats can override these.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">model</label>
                <Input
                  type="text"
                  placeholder="default (leave empty)"
                  value={store.modelConfig.model}
                  onChange={(e) => store.setModelConfig({ model: e.target.value })}
                  className="bg-black/50 h-8 text-xs"
                />
                <p className="text-[10px] text-zinc-600 mt-1">
                  e.g. claude-opus-4-7-20250417, claude-sonnet-4-6-20250417
                </p>
              </div>

              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">reasoning effort</label>
                <Select
                  value={store.modelConfig.reasoningEffort || '__default__'}
                  onValueChange={(val) => store.setModelConfig({ reasoningEffort: val === '__default__' ? '' : val as ModelConfig['reasoningEffort'] })}
                >
                  <SelectTrigger className="bg-black/50 h-8 text-xs">
                    <SelectValue placeholder="default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">default</SelectItem>
                    <SelectItem value="low">low</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="high">high</SelectItem>
                    <SelectItem value="xhigh">xhigh</SelectItem>
                    <SelectItem value="max">max</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-700 pt-4">
            <h4 className="text-sm font-bold text-zinc-300 mb-3">quick switch models</h4>
            <p className="text-xs text-zinc-500 mb-4">
              presets for quickly switching models in chat. click the model name in the chat input area to switch.
            </p>

            <div className="space-y-2">
              {store.quickSwitchModels.map((entry, i) => (
                <QuickSwitchModelRow key={i} entry={entry} index={i} store={store} />
              ))}
            </div>

            <QuickSwitchModelAdder store={store} />
          </div>
        </div>
      </div>
    </div>
  );
});

const QuickSwitchModelRow = observer(({ entry, index, store }: { entry: QuickSwitchModel; index: number; store: SessionStore }) => {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(entry.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== entry.label) {
      store.updateQuickSwitchModel(index, { label: trimmed });
    } else {
      setLabel(entry.label);
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 group">
      <div className="flex-1 text-xs bg-black/40 border border-zinc-700 px-2 py-1.5 truncate flex items-center gap-1.5 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setLabel(entry.label); setEditing(false); }
            }}
            className="bg-transparent text-zinc-300 outline-none w-full text-xs"
          />
        ) : (
          <>
            <span className="text-zinc-400 truncate">{entry.label}</span>
            <button
              className="text-zinc-700 hover:text-zinc-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
              onClick={() => { setLabel(entry.label); setEditing(true); }}
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          </>
        )}
        <span className="text-zinc-600 mx-0.5 shrink-0">·</span>
        <span className="text-zinc-500 text-[10px] shrink-0">{entry.model}{entry.reasoningEffort ? ` (${entry.reasoningEffort})` : ''}</span>
      </div>
      <button
        className="text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        onClick={() => store.removeQuickSwitchModel(index)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

const QuickSwitchModelAdder = observer(({ store }: { store: SessionStore }) => {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState<ModelConfig['reasoningEffort']>('');

  if (!adding) {
    return (
      <button
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mt-3"
        onClick={() => setAdding(true)}
      >
        <Plus className="h-3 w-3" /> add preset
      </button>
    );
  }

  const handleAdd = () => {
    if (!label.trim() || !model.trim()) return;
    store.addQuickSwitchModel({ label: label.trim(), model: model.trim(), reasoningEffort: effort });
    setLabel('');
    setModel('');
    setEffort('');
    setAdding(false);
  };

  return (
    <div className="mt-3 space-y-2 border border-zinc-700 p-2.5 bg-black/40">
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">label</label>
        <Input
          type="text"
          placeholder="e.g. sonnet fast"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="bg-black/50 h-7 text-xs"
          autoFocus
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">model id</label>
        <Input
          type="text"
          placeholder="e.g. claude-sonnet-4-6-20250417"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="bg-black/50 h-7 text-xs"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">reasoning effort</label>
        <Select value={effort || '__default__'} onValueChange={(val) => setEffort(val === '__default__' ? '' : val as ModelConfig['reasoningEffort'])}>
          <SelectTrigger className="bg-black/50 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">default</SelectItem>
            <SelectItem value="low">low</SelectItem>
            <SelectItem value="medium">medium</SelectItem>
            <SelectItem value="high">high</SelectItem>
            <SelectItem value="xhigh">xhigh</SelectItem>
            <SelectItem value="max">max</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={handleAdd} disabled={!label.trim() || !model.trim()}>
          add
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding(false)}>
          cancel
        </Button>
      </div>
    </div>
  );
});
