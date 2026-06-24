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
    };
    encryption = { decrypt: vi.fn().mockReturnValue('decrypted-nsec-hex') };
    rpcHandler = { setPendingSecretLookup: vi.fn() };
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

  describe('pending secrets', () => {
    it('should register and consume pending secret', () => {
      const pubkey = 'a'.repeat(64);
      const secret = 'secret123';
      const info = { userId: 'u1', nsecKeyId: 'k1', name: 'Test' };
      service.registerPendingSecret(pubkey, secret, info);
      expect(service.getPendingSecretCount()).toBe(1);
      const consumed = service.consumePendingSecret(pubkey, secret);
      expect(consumed).toEqual(info);
      expect(service.getPendingSecretCount()).toBe(0);
    });

    it('should return undefined when consuming unknown secret', () => {
      const result = service.consumePendingSecret('a'.repeat(64), 'unknown');
      expect(result).toBeUndefined();
    });

    it('preserves the operator-chosen permission seed through register/consume', () => {
      const pubkey = 'b'.repeat(64);
      const secret = 'secret-with-perms';
      const info = {
        userId: 'u1',
        nsecKeyId: 'k1',
        name: 'Test',
        permissions: [
          { method: 'sign_event' as const, kind: 30078 },
          { method: 'nip44_decrypt' as const },
        ],
      };
      service.registerPendingSecret(pubkey, secret, info);
      // The connect handler reads these back to seed the auto-created connection's granted permissions.
      expect(service.consumePendingSecret(pubkey, secret)).toEqual(info);
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
