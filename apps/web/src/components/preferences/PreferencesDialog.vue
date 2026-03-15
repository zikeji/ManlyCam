<script setup lang="ts">
import { computed } from 'vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useNotificationPreferences } from '@/composables/useNotificationPreferences';
import { useBrowserNotifications } from '@/composables/useBrowserNotifications';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const { preferences, updatePreference } = useNotificationPreferences();
const { requestPermission } = useBrowserNotifications();

const permissionStatus = computed<NotificationPermission | 'unsupported'>(() => {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
});

async function handleNotificationToggle(
  key: 'chatMessages' | 'mentions' | 'streamState',
  value: boolean,
): Promise<void> {
  if (value && permissionStatus.value === 'default') {
    const result = await requestPermission();
    if (result !== 'granted') {
      // Permission denied — leave toggle off
      return;
    }
  }
  updatePreference(key, value);
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Preferences</DialogTitle>
        <DialogDescription class="sr-only">Notification and display preferences for this browser.</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <p
          v-if="permissionStatus === 'denied'"
          class="text-sm text-destructive"
          role="alert"
        >
          Notifications are blocked. Enable them in your browser settings to use notification features.
        </p>

        <p
          v-if="permissionStatus === 'unsupported'"
          class="text-sm text-muted-foreground"
        >
          Browser notifications are not supported in this browser.
        </p>

        <div class="space-y-3">
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notifications</p>
          <p class="text-xs text-muted-foreground -mt-1">These preferences are saved to this browser only.</p>

          <div class="flex items-center justify-between">
            <label for="pref-chat-messages" class="text-sm cursor-pointer">Chat messages</label>
            <Switch
              id="pref-chat-messages"
              :modelValue="preferences.chatMessages"
              @update:modelValue="(v: boolean) => handleNotificationToggle('chatMessages', v)"
            />
          </div>

          <div class="flex items-center justify-between">
            <label for="pref-mentions" class="text-sm cursor-pointer">@Mentions</label>
            <Switch
              id="pref-mentions"
              :modelValue="preferences.mentions"
              @update:modelValue="(v: boolean) => handleNotificationToggle('mentions', v)"
            />
          </div>

          <div class="flex items-center justify-between">
            <label for="pref-stream-state" class="text-sm cursor-pointer">Stream state changes</label>
            <Switch
              id="pref-stream-state"
              :modelValue="preferences.streamState"
              @update:modelValue="(v: boolean) => handleNotificationToggle('streamState', v)"
            />
          </div>
        </div>

        <div class="border-t pt-4 space-y-3">
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Display</p>

          <div class="flex items-center justify-between">
            <div>
              <label for="pref-flash-titlebar" class="text-sm cursor-pointer">Flash titlebar on mention</label>
              <p class="text-xs text-muted-foreground mt-0.5">Flashes the browser tab title when you're mentioned while on another tab.</p>
            </div>
            <Switch
              id="pref-flash-titlebar"
              :modelValue="preferences.flashTitlebar"
              @update:modelValue="(v: boolean) => updatePreference('flashTitlebar', v)"
            />
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
