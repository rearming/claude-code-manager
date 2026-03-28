import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { X, Bell } from 'lucide-react';
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
import type { SessionStore } from '../stores/SessionStore';

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
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-zinc-200">settings</h3>
          <Button size="icon" variant="ghost" onClick={() => store.toggleSettings()}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-6">
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
                  e.g. claude-sonnet-4-5-20250514, claude-opus-4-0-20250514
                </p>
              </div>

              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">reasoning effort</label>
                <Select
                  value={store.modelConfig.reasoningEffort || '__default__'}
                  onValueChange={(val) => store.setModelConfig({ reasoningEffort: val === '__default__' ? '' : val as 'low' | 'medium' | 'high' })}
                >
                  <SelectTrigger className="bg-black/50 h-8 text-xs">
                    <SelectValue placeholder="default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">default</SelectItem>
                    <SelectItem value="low">low</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="high">high</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
