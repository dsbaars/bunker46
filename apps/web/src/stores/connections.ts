import { atom } from 'nanostores';
import type { BunkerConnectionDto } from '@bunker46/shared-types';

const $connections = atom<BunkerConnectionDto[]>([]);
const $selectedConnection = atom<BunkerConnectionDto | null>(null);

export function useConnectionsStore() {
  return {
    get connections() {
      return $connections.get();
    },
    get selectedConnection() {
      return $selectedConnection.get();
    },

    setConnections(connections: BunkerConnectionDto[]) {
      $connections.set([...connections]);
    },

    selectConnection(connection: BunkerConnectionDto | null) {
      $selectedConnection.set(connection ? { ...connection } : null);
    },

    updateConnection(id: string, updates: Partial<BunkerConnectionDto>) {
      const current = $connections.get();
      $connections.set(current.map((c) => (c.id === id ? { ...c, ...updates } : c)));
      const selected = $selectedConnection.get();
      if (selected?.id === id) {
        $selectedConnection.set({ ...selected, ...updates });
      }
    },

    removeConnection(id: string) {
      $connections.set($connections.get().filter((c) => c.id !== id));
      if ($selectedConnection.get()?.id === id) {
        $selectedConnection.set(null);
      }
    },
  };
}

export { $connections, $selectedConnection };
