import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
});
