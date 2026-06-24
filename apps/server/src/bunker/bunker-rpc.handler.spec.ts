import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BunkerRpcHandler } from './bunker-rpc.handler.js';
import type { ConnectionsService } from '../connections/connections.service.js';
import type { LoggingService } from '../logging/logging.service.js';
import type { EventsService } from '../events/events.service.js';
import type { EncryptionService } from '../common/crypto/encryption.service.js';
import type { Nip46Request } from '@bunker46/shared-types';

type Perm = { method: string; kind?: number; allowed?: boolean };

describe('BunkerRpcHandler', () => {
  let handler: BunkerRpcHandler;
  let connections: Partial<ConnectionsService>;
  let loggingService: Partial<LoggingService>;
  let eventsService: Partial<EventsService>;
  let encryption: Partial<EncryptionService>;

  const signEvent = vi.fn().mockResolvedValue('{"sig":"deadbeef"}');
  const nip04Encrypt = vi.fn().mockResolvedValue('enc04');
  const nip04Decrypt = vi.fn().mockResolvedValue('dec04');
  const nip44Encrypt = vi.fn().mockResolvedValue('enc44');
  const nip44Decrypt = vi.fn().mockResolvedValue('dec44');
  const getPublicKeyFromNsec = vi.fn().mockReturnValue('signer-pubkey-hex');

  const CLIENT = 'client-pubkey-hex';
  const SIGNER = 'signer-pubkey-hex';

  function makeConnection(permissions: Perm[], status = 'ACTIVE', secret?: string) {
    return {
      id: 'conn-1',
      userId: 'user-1',
      name: 'Test App',
      clientPubkey: CLIENT,
      status,
      relays: ['wss://relay.example.com'],
      secret,
      permissions: permissions.map((p) => ({
        method: p.method,
        kind: p.kind ?? null,
        allowed: p.allowed ?? true,
      })),
      nsecKey: { encryptedNsec: 'encrypted-nsec' },
    };
  }

  function request(method: string, params: string[] = [], id = 'req-1'): Nip46Request {
    return { id, method, params } as Nip46Request;
  }

  function handle(req: Nip46Request) {
    return handler.handleRequest(
      CLIENT,
      SIGNER,
      req,
      signEvent,
      nip04Encrypt,
      nip04Decrypt,
      nip44Encrypt,
      nip44Decrypt,
      getPublicKeyFromNsec,
    );
  }

  const signEventJson = (kind: number) => JSON.stringify({ kind, content: 'hello', tags: [] });

  beforeEach(() => {
    vi.clearAllMocks();
    connections = {
      findByClientAndSigner: vi.fn().mockResolvedValue(null),
      updateConnectionStatus: vi.fn().mockResolvedValue(undefined as never),
      setPermissions: vi.fn().mockResolvedValue(undefined as never),
      requestPermissions: vi.fn().mockResolvedValue(undefined as never),
      touchActivity: vi.fn().mockResolvedValue(undefined as never),
    };
    loggingService = { logSigningAction: vi.fn().mockResolvedValue(undefined as never) };
    eventsService = { publishUserActivity: vi.fn().mockResolvedValue(undefined as never) };
    encryption = { decrypt: vi.fn().mockReturnValue('nsec-hex') };
    handler = new BunkerRpcHandler(
      connections as ConnectionsService,
      loggingService as LoggingService,
      eventsService as EventsService,
      encryption as EncryptionService,
    );
  });

  describe('unknown / revoked connections', () => {
    it('rejects a non-connect request from an unknown client', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(null as never);
      const res = await handle(request('sign_event', [signEventJson(1)]));
      expect(res).toEqual({ id: 'req-1', error: 'Unknown client' });
      expect(signEvent).not.toHaveBeenCalled();
      // No connection => no activity/logging side effects.
      expect(loggingService.logSigningAction).not.toHaveBeenCalled();
    });

    it('rejects requests on a REVOKED connection', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([{ method: 'sign_event' }], 'REVOKED') as never,
      );
      const res = await handle(request('sign_event', [signEventJson(1)]));
      expect(res).toEqual({ id: 'req-1', error: 'Connection revoked' });
      expect(signEvent).not.toHaveBeenCalled();
    });
  });

  describe('signer binding (M1)', () => {
    it('resolves the connection scoped to the signer pubkey the request was addressed to', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([{ method: 'sign_event', kind: 1 }]) as never,
      );
      await handle(request('sign_event', [signEventJson(1)]));
      // The relay #p tag / listener key is passed through so a request for signer A cannot be served
      // by a connection bound to signer B.
      expect(connections.findByClientAndSigner).toHaveBeenCalledWith(CLIENT, SIGNER);
    });
  });

  describe('default-deny permission model', () => {
    it('denies sign_event when the connection has NO permissions (not fail-open)', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(makeConnection([]) as never);
      const res = await handle(request('sign_event', [signEventJson(1)]));
      expect(res.error).toBe('Permission denied for sign_event kind:1');
      expect(res.result).toBeUndefined();
      expect(signEvent).not.toHaveBeenCalled();
    });

    it('denies nip44_decrypt with no permissions (no blanket decryption oracle)', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(makeConnection([]) as never);
      const res = await handle(request('nip44_decrypt', ['third-party-pubkey', 'ciphertext']));
      expect(res.error).toBe('Permission denied for nip44_decrypt');
      expect(nip44Decrypt).not.toHaveBeenCalled();
    });

    it('denies nip04_decrypt with no permissions', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(makeConnection([]) as never);
      const res = await handle(request('nip04_decrypt', ['third-party-pubkey', 'ciphertext']));
      expect(res.error).toBe('Permission denied for nip04_decrypt');
      expect(nip04Decrypt).not.toHaveBeenCalled();
    });
  });

  describe('permission enforcement', () => {
    it('allows sign_event for a kind explicitly permitted', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([{ method: 'sign_event', kind: 1 }]) as never,
      );
      const res = await handle(request('sign_event', [signEventJson(1)]));
      expect(res.error).toBeUndefined();
      expect(res.result).toBe('{"sig":"deadbeef"}');
      expect(signEvent).toHaveBeenCalledWith(signEventJson(1), 'nsec-hex');
    });

    it('denies sign_event for a kind that is not permitted', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([{ method: 'sign_event', kind: 1 }]) as never,
      );
      const res = await handle(request('sign_event', [signEventJson(2)]));
      expect(res.error).toBe('Permission denied for sign_event kind:2');
      expect(signEvent).not.toHaveBeenCalled();
    });

    it('a method-level sign_event permission (no kind) allows any kind', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([{ method: 'sign_event' }]) as never,
      );
      const res = await handle(request('sign_event', [signEventJson(30023)]));
      expect(res.error).toBeUndefined();
      expect(signEvent).toHaveBeenCalledTimes(1);
    });

    it('allows nip44_decrypt when explicitly permitted', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([{ method: 'nip44_decrypt' }]) as never,
      );
      const res = await handle(request('nip44_decrypt', ['third-party-pubkey', 'ciphertext']));
      expect(res.error).toBeUndefined();
      expect(res.result).toBe('dec44');
      expect(nip44Decrypt).toHaveBeenCalledWith('ciphertext', 'third-party-pubkey', 'nsec-hex');
    });
  });

  describe('unguarded informational methods', () => {
    it('responds to ping without requiring a permission', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(makeConnection([]) as never);
      const res = await handle(request('ping'));
      expect(res.result).toBe('pong');
      expect(res.error).toBeUndefined();
    });

    it('returns get_public_key without requiring a permission', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(makeConnection([]) as never);
      const res = await handle(request('get_public_key'));
      expect(res.result).toBe('signer-pubkey-hex');
      expect(res.error).toBeUndefined();
    });
  });

  describe('connect handshake', () => {
    it('activates a PENDING connection and echoes its secret', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([], 'PENDING', 'the-secret') as never,
      );
      const res = await handle(request('connect', ['', '']));
      expect(connections.updateConnectionStatus).toHaveBeenCalledWith('conn-1', 'ACTIVE');
      expect(res.result).toBe('the-secret');
    });

    it('records client-requested permissions as PENDING (not granted) on connect', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([], 'PENDING') as never,
      );
      await handle(request('connect', ['', '', 'sign_event:1,nip44_decrypt']));
      // Requested, not granted: recorded for operator approval, never applied directly.
      expect(connections.requestPermissions).toHaveBeenCalledWith('conn-1', [
        { method: 'sign_event', kind: 1 },
        { method: 'nip44_decrypt', kind: undefined },
      ]);
      expect(connections.setPermissions).not.toHaveBeenCalled();
    });
  });

  describe('pending permissions do not grant access', () => {
    it('denies a capability that is only PENDING (allowed=false), even if requested on connect', async () => {
      // A pending nip44_decrypt (operator has not approved it) must not authorize decryption.
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([{ method: 'nip44_decrypt', allowed: false }]) as never,
      );
      const res = await handle(request('nip44_decrypt', ['third-party-pubkey', 'ciphertext']));
      expect(res.error).toBe('Permission denied for nip44_decrypt');
      expect(nip44Decrypt).not.toHaveBeenCalled();
    });

    it('allows the same capability once it has been approved (allowed=true)', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([{ method: 'nip44_decrypt', allowed: true }]) as never,
      );
      const res = await handle(request('nip44_decrypt', ['third-party-pubkey', 'ciphertext']));
      expect(res.error).toBeUndefined();
      expect(nip44Decrypt).toHaveBeenCalledTimes(1);
    });
  });

  describe('denied gated requests surface as pending', () => {
    it('records a denied sign_event kind as a PENDING permission request for operator approval', async () => {
      // Granted only kind 1; the client signs kind 30078 (app data) which is not permitted.
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([{ method: 'sign_event', kind: 1 }]) as never,
      );
      const res = await handle(request('sign_event', [signEventJson(30078)]));
      expect(res.error).toBe('Permission denied for sign_event kind:30078');
      expect(connections.requestPermissions).toHaveBeenCalledWith('conn-1', [
        { method: 'sign_event', kind: 30078 },
      ]);
    });

    it('records a denied nip44_decrypt as a PENDING (method-level) request', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(makeConnection([]) as never);
      await handle(request('nip44_decrypt', ['third-party-pubkey', 'ciphertext']));
      expect(connections.requestPermissions).toHaveBeenCalledWith('conn-1', [
        { method: 'nip44_decrypt' },
      ]);
    });

    it('does NOT record a pending request when the capability is already permitted', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([{ method: 'sign_event', kind: 1 }]) as never,
      );
      await handle(request('sign_event', [signEventJson(1)]));
      expect(connections.requestPermissions).not.toHaveBeenCalled();
    });
  });

  describe('audit logging', () => {
    it('logs an approved signing action and publishes activity', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(
        makeConnection([{ method: 'sign_event', kind: 1 }]) as never,
      );
      await handle(request('sign_event', [signEventJson(1)]));
      expect(connections.touchActivity).toHaveBeenCalledWith('conn-1');
      expect(loggingService.logSigningAction).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'conn-1',
          userId: 'user-1',
          method: 'sign_event',
          eventKind: 1,
          result: 'APPROVED',
        }),
      );
      expect(eventsService.publishUserActivity).toHaveBeenCalledWith('user-1');
    });

    it('logs a permission-denied signing action as a non-approved result', async () => {
      vi.mocked(connections.findByClientAndSigner!).mockResolvedValue(makeConnection([]) as never);
      await handle(request('sign_event', [signEventJson(1)]));
      expect(loggingService.logSigningAction).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'sign_event', result: 'ERROR' }),
      );
    });
  });
});
