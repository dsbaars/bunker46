import { onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth';

/**
 * Subscribe to server-sent activity events (e.g. connection used, new connection).
 * When Redis is configured, the server pushes an event so the UI can refetch.
 * Calls onActivity when an event is received.
 * Uses fetch + ReadableStream so the token is sent via Authorization header (not in URL).
 */
export function useActivityStream(onActivity: () => void) {
  let abortController: AbortController | null = null;

  onMounted(() => {
    const auth = useAuthStore();
    const token = auth.accessToken;
    if (!token) return;

    abortController = new AbortController();
    const url = '/api/events/stream';

    fetch(url, {
      signal: abortController.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === 'activity') onActivity();
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      })
      .catch(() => {
        // Aborted or network error – ignore
      });
  });

  onUnmounted(() => {
    abortController?.abort();
    abortController = null;
  });
}
