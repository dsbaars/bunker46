import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NOSTR_CONSTANTS } from '@bunker46/config';
import { BunkerService } from './bunker.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { BunkerRpcHandler } from './bunker-rpc.handler.js';
import type { EncryptionService } from '../common/crypto/encryption.service.js';

vi.mock('nostr-tools/pool', () => ({
  SimplePool: vi.fn().mockImplementation(function (this: unknown) {
    return {
      subscribe: vi.fn().mockReturnValue({ close: vi.fn() }),
      close: vi.fn(),
      publish: vi.fn().mockResolvedValue(undefined),
      listConnectionStatus: vi.fn().mockReturnValue(new Map<string, boolean>()),
    };
  }),
  useWebSocketImplementation: vi.fn(),
}));

describe('BunkerService', () => {
  let service: BunkerService;
  let prisma: Partial<PrismaService>;
  let encryption: Partial<EncryptionService>;
  let rpcHandler: Partial<BunkerRpcHandler>;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = {
      nsecKey: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      relayConfig: { findMany: vi.fn().mockResolvedValue([]) },
      bunkerSecret: {
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    encryption = { decrypt: vi.fn().mockReturnValue('decrypted-nsec-hex') };
    rpcHandler = { setPendingSecretLookup: vi.fn(), setSecretBinder: vi.fn() };
    service = new BunkerService(
      rpcHandler as BunkerRpcHandler,
      prisma as PrismaService,
      encryption as EncryptionService,
      [...NOSTR_CONSTANTS.DEFAULT_RELAYS],
    );
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('bunker secrets', () => {
    const pubkey = 'a'.repeat(64);
    const secret = 'secret123';
    // Pinned: a change to the hashing scheme would silently invalidate every bunker:// URI
    // already in the wild, so it should fail here first.
    const secretHash = createHash('sha256').update(secret).digest('hex');

    const storedSecret = (overrides: Record<string, unknown> = {}) => ({
      id: 's1',
      userId: 'u1',
      nsecKeyId: 'k1',
      name: 'Test',
      permissions: null,
      connectionId: null,
      nsecKey: { publicKey: pubkey },
      ...overrides,
    });

    it('persists only the hash of the secret, never the secret itself', async () => {
      await service.registerPendingSecret(pubkey, secret, {
        userId: 'u1',
        nsecKeyId: 'k1',
        name: 'Test',
      });
      const { data } = vi.mocked(prisma.bunkerSecret!.create).mock.calls[0][0];
      expect(data.secretHash).toBe(secretHash);
      expect(JSON.stringify(data)).not.toContain(secret);
    });

    it('resolves a secret WITHOUT invalidating it, so the same URI can reconnect', async () => {
      vi.mocked(prisma.bunkerSecret!.findUnique).mockResolvedValue(storedSecret());

      // Twice: this is the whole point of the change. A web client that regenerates its ephemeral
      // NIP-46 keypair on every page load presents this same secret again on the next load.
      const first = await service.consumePendingSecret(pubkey, secret);
      const second = await service.consumePendingSecret(pubkey, secret);
      expect(first).toEqual(second);
      expect(first).toMatchObject({ secretId: 's1', userId: 'u1', nsecKeyId: 'k1', name: 'Test' });
      // Nothing is deleted; only the usage counters move.
      expect(prisma.bunkerSecret!.update).toHaveBeenCalledTimes(2);
    });

    it('returns undefined for an unknown secret', async () => {
      vi.mocked(prisma.bunkerSecret!.findUnique).mockResolvedValue(null);
      expect(await service.consumePendingSecret(pubkey, 'unknown')).toBeUndefined();
    });

    it('refuses a secret presented for a different signer key', async () => {
      // The secret is bound to the nsec key it was minted for, so it cannot be replayed to bind a
      // connection to some other key.
      vi.mocked(prisma.bunkerSecret!.findUnique).mockResolvedValue(
        storedSecret({ nsecKey: { publicKey: 'f'.repeat(64) } }),
      );
      expect(await service.consumePendingSecret(pubkey, secret)).toBeUndefined();
      expect(prisma.bunkerSecret!.update).not.toHaveBeenCalled();
    });

    it('preserves the operator-chosen permission seed and the owned connection', async () => {
      const permissions = [
        { method: 'sign_event' as const, kind: 30078 },
        { method: 'nip44_decrypt' as const },
      ];
      vi.mocked(prisma.bunkerSecret!.findUnique).mockResolvedValue(
        storedSecret({ permissions, connectionId: 'conn-1' }),
      );
      // The connect handler seeds the auto-created connection's granted permissions from these,
      // and uses connectionId to rebind an existing connection rather than duplicate it.
      expect(await service.consumePendingSecret(pubkey, secret)).toMatchObject({
        permissions,
        connectionId: 'conn-1',
      });
    });

    it('drops a permission seed that no longer parses rather than trusting it', async () => {
      vi.mocked(prisma.bunkerSecret!.findUnique).mockResolvedValue(
        storedSecret({ permissions: [{ method: 'not_a_real_method' }] }),
      );
      // Undefined makes createConnection fall back to the conservative defaults.
      expect((await service.consumePendingSecret(pubkey, secret))?.permissions).toBeUndefined();
    });
  });

  describe('listeners', () => {
    it('should start listening and report active count', async () => {
      const poolModule = await import('nostr-tools/pool');
      const pubkey = 'b'.repeat(64);
      const nsec = 'c'.repeat(64);
      expect(service.isListening(pubkey)).toBe(false);
      expect(service.getActiveListenerCount()).toBe(0);
      service.startListeningForKey(pubkey, nsec, ['wss://relay.example.com']);
      expect(service.isListening(pubkey)).toBe(true);
      expect(service.getActiveListenerCount()).toBe(1);
      const poolInstance = vi.mocked(poolModule.SimplePool).mock.results.at(-1)?.value;
      expect(poolInstance?.subscribe).toHaveBeenCalledWith(
        ['wss://relay.example.com'],
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should stop listening when stopListeningForKey is called', async () => {
      const poolModule = await import('nostr-tools/pool');
      const closeFn = vi.fn();
      vi.mocked(poolModule.SimplePool).mockImplementationOnce(function (this: unknown) {
        return {
          subscribe: vi.fn().mockReturnValue({ close: closeFn }),
          close: vi.fn(),
          publish: vi.fn().mockResolvedValue(undefined),
        };
      });
      service = new BunkerService(
        rpcHandler as BunkerRpcHandler,
        prisma as PrismaService,
        encryption as EncryptionService,
        [...NOSTR_CONSTANTS.DEFAULT_RELAYS],
      );
      await service.onModuleInit();
      const pubkey = 'd'.repeat(64);
      service.startListeningForKey(pubkey, 'e'.repeat(64), ['wss://r.example.com']);
      expect(service.isListening(pubkey)).toBe(true);
      service.stopListeningForKey(pubkey);
      expect(closeFn).toHaveBeenCalled();
      expect(service.isListening(pubkey)).toBe(false);
      await service.onModuleDestroy();
    });

    it('should use default relays when empty array passed', async () => {
      const poolModule = await import('nostr-tools/pool');
      service.startListeningForKey('f'.repeat(64), 'g'.repeat(64), []);
      const poolInstance = vi.mocked(poolModule.SimplePool).mock.results.at(-1)?.value;
      expect(poolInstance?.subscribe).toHaveBeenCalled();
      const [relays] = (poolInstance?.subscribe as ReturnType<typeof vi.fn>)?.mock.calls[0] ?? [];
      expect(Array.isArray(relays)).toBe(true);
      expect(relays.length).toBeGreaterThan(0);
    });
  });

  describe('connection watchdog', () => {
    // Build a service whose pool reports the given relay connection status, and
    // invoke the watchdog's check directly (avoids fragile fake-timer machinery).
    async function makeService(status: Map<string, boolean>) {
      const poolModule = await import('nostr-tools/pool');
      const subscribe = vi.fn().mockReturnValue({ close: vi.fn() });
      const listConnectionStatus = vi.fn().mockReturnValue(status);
      vi.mocked(poolModule.SimplePool).mockImplementationOnce(function (this: unknown) {
        return {
          subscribe,
          close: vi.fn(),
          publish: vi.fn().mockResolvedValue(undefined),
          listConnectionStatus,
        };
      });
      const svc = new BunkerService(
        rpcHandler as BunkerRpcHandler,
        prisma as PrismaService,
        encryption as EncryptionService,
        [...NOSTR_CONSTANTS.DEFAULT_RELAYS],
      );
      await svc.onModuleInit();
      const runWatchdog = () => (svc as unknown as { checkConnections(): void }).checkConnections();
      return { svc, subscribe, listConnectionStatus, runWatchdog };
    }

    it('schedules a periodic check on init', async () => {
      const spy = vi.spyOn(globalThis, 'setInterval');
      const { svc } = await makeService(new Map());
      expect(spy).toHaveBeenCalledWith(
        expect.any(Function),
        NOSTR_CONSTANTS.RELAY_WATCHDOG_INTERVAL_MS,
      );
      await svc.onModuleDestroy();
      spy.mockRestore();
    });

    it('re-subscribes a listener when its relay connection has dropped', async () => {
      // Empty status map => relay reported as not connected => watchdog must act.
      const { svc, subscribe, listConnectionStatus, runWatchdog } = await makeService(new Map());

      const pubkey = 'a'.repeat(64);
      svc.startListeningForKey(pubkey, 'b'.repeat(64), ['wss://relay.example.com']);
      expect(subscribe).toHaveBeenCalledTimes(1);

      runWatchdog();

      expect(listConnectionStatus).toHaveBeenCalled();
      expect(subscribe).toHaveBeenCalledTimes(2);
      expect(svc.isListening(pubkey)).toBe(true);

      await svc.onModuleDestroy();
    });

    it('leaves a listener untouched while its relays stay connected', async () => {
      // Note: status keys are normalized URLs (bare host gains a trailing slash).
      const { svc, subscribe, runWatchdog } = await makeService(
        new Map([['wss://relay.example.com/', true]]),
      );

      svc.startListeningForKey('a'.repeat(64), 'b'.repeat(64), ['wss://relay.example.com']);
      expect(subscribe).toHaveBeenCalledTimes(1);

      runWatchdog();

      expect(subscribe).toHaveBeenCalledTimes(1);

      await svc.onModuleDestroy();
    });
  });
});
