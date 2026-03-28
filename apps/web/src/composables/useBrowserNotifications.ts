import { onUnmounted } from 'vue';

const NOTIFICATION_CHANNEL = 'manlycam-notifications';
const LEADER_TIMEOUT_MS = 100;

// Module-level state for single-tab coordination
let isLeader = false;
let channel: BroadcastChannel | null = null;

function initChannel(): void {
  if (channel) return;
  channel = new BroadcastChannel(NOTIFICATION_CHANNEL);
  channel.onmessage = (event: MessageEvent<{ type: string }>) => {
    if (event.data.type === 'claim-leader' || event.data.type === 'notification-shown') {
      isLeader = false;
    }
  };
}

export function useBrowserNotifications() {
  async function requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    return Notification.requestPermission();
  }

  function showNotification(title: string, options?: NotificationOptions): void {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    initChannel();

    // Race to become leader — any other tab hearing 'claim-leader' yields
    isLeader = true;
    channel!.postMessage({ type: 'claim-leader' });

    setTimeout(() => {
      if (!isLeader) return;

      const notification = new Notification(title, {
        ...options,
        icon: '/favicon.svg',
        tag: 'manlycam', // Replaces previous notifications (deduplicates)
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      channel!.postMessage({ type: 'notification-shown' });
    }, LEADER_TIMEOUT_MS);
  }

  /* c8 ignore next 4 -- module-level channel can't be unmounted in tests */
  onUnmounted(() => {
    channel?.close();
    channel = null;
  });

  return { requestPermission, showNotification };
}
