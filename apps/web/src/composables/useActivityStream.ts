import { onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth';

/**
 * Subscribe to server-sent activity events (e.g. connection used, new connection).
 * When Redis is configured, the server pushes an event so the UI can refetch.
 * Calls onActivity when an event is received.
 */
export function useActivityStream(onActivity: () => void) {
  let eventSource: EventSource | null = null;

  onMounted(() => {
    const auth = useAuthStore();
    const token = auth.accessToken;
    if (!token) return;

    const url = `/api/events/stream?access_token=${encodeURIComponent(token)}`;
    eventSource = new EventSource(url);

    eventSource.onmessage = () => {
      onActivity();
    };

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
    };
  });

  onUnmounted(() => {
    eventSource?.close();
    eventSource = null;
  });
}
