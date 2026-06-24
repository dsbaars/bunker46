import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConnectionsService } from './connections.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EncryptionService } from '../common/crypto/encryption.service.js';
import type { EventsService } from '../events/events.service.js';

describe('ConnectionsService', () => {
  let service: ConnectionsService;
  let prisma: Partial<PrismaService>;
  let encryption: Partial<EncryptionService>;
  let eventsService: Partial<EventsService>;

  beforeEach(() => {
    prisma = {
      nsecKey: {
        create: vi.fn().mockResolvedValue({ id: 'key-1', publicKey: 'pub', label: 'My Key' }),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      bunkerConnection: {
        create: vi.fn().mockResolvedValue({ id: 'conn-1', status: 'PENDING' }),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ id: 'conn-1', status: 'PENDING', permissions: [] }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(undefined),
        count: vi.fn().mockResolvedValue(0),
      },
      connectionPermission: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    encryption = {
      encrypt: vi.fn().mockReturnValue('encrypted'),
      decrypt: vi.fn().mockReturnValue('nsec-hex'),
    };
    eventsService = { publishUserActivity: vi.fn().mockResolvedValue(undefined) };
    service = new ConnectionsService(
      prisma as PrismaService,
      encryption as EncryptionService,
      eventsService as EventsService,
    );
  });

  describe('addNsecKey', () => {
    it('should encrypt and create nsec key', async () => {
      const result = await service.addNsecKey('user-1', 'nsec-hex', 'pubkey', 'Label');
      expect(encryption.encrypt).toHaveBeenCalledWith('nsec-hex');
      expect(prisma.nsecKey?.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', publicKey: 'pubkey', encryptedNsec: 'encrypted', label: 'Label' },
      });
      expect(result).toMatchObject({ id: 'key-1', publicKey: 'pub' });
    });
  });

  describe('getDecryptedNsec', () => {
    it('should throw ForbiddenException when key not found or wrong user', async () => {
      await expect(service.getDecryptedNsec('key-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should return decrypted nsec when key belongs to user', async () => {
      vi.mocked(prisma.nsecKey!.findUnique!).mockResolvedValue({
        id: 'key-1',
        userId: 'user-1',
        encryptedNsec: 'enc',
      } as never);
      const result = await service.getDecryptedNsec('key-1', 'user-1');
      expect(result).toBe('nsec-hex');
      expect(encryption.decrypt).toHaveBeenCalledWith('enc');
    });

    it('should throw when key belongs to different user', async () => {
      vi.mocked(prisma.nsecKey!.findUnique!).mockResolvedValue({
        id: 'key-1',
        userId: 'other-user',
        encryptedNsec: 'enc',
      } as never);
      await expect(service.getDecryptedNsec('key-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createConnection', () => {
    it('should create connection, seed default permissions and publish activity', async () => {
      vi.mocked(prisma.nsecKey!.findFirst!).mockResolvedValue({
        id: 'key-1',
        userId: 'user-1',
      } as never);

      await service.createConnection('user-1', 'key-1', 'client-pub', { name: 'App' });

      // C1: ownership of the nsec key is verified, scoped by the authenticated userId.
      expect(prisma.nsecKey?.findFirst).toHaveBeenCalledWith({
        where: { id: 'key-1', userId: 'user-1' },
      });
      expect(prisma.bunkerConnection?.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            nsecKeyId: 'key-1',
            clientPubkey: 'client-pub',
            name: 'App',
            status: 'PENDING',
          }),
        }),
      );
      // H2: a conservative default permission set is seeded so the connection is not fail-open.
      const seedArg = vi.mocked(prisma.connectionPermission!.createMany!).mock.calls[0]?.[0] as {
        data: Array<{ connectionId: string; method: string; kind: number | null }>;
      };
      expect(seedArg.data.length).toBeGreaterThan(0);
      expect(seedArg.data.every((p) => p.connectionId === 'conn-1')).toBe(true);
      expect(seedArg.data.every((p) => p.method === 'sign_event')).toBe(true);
      expect(seedArg.data.map((p) => p.kind)).toEqual(expect.arrayContaining([0, 1, 3, 4, 7]));
      expect(eventsService.publishUserActivity).toHaveBeenCalledWith('user-1');
    });

    it('should throw NotFoundException when the nsec key does not belong to the user (C1)', async () => {
      // findFirst scoped by { id, userId } returns null for a foreign or non-existent key.
      vi.mocked(prisma.nsecKey!.findFirst!).mockResolvedValue(null as never);

      await expect(
        service.createConnection('attacker', 'victim-key', 'client-pub', { name: 'Evil' }),
      ).rejects.toThrow(NotFoundException);

      // The connection is never created and no key is bound.
      expect(prisma.bunkerConnection?.create).not.toHaveBeenCalled();
      expect(prisma.connectionPermission?.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getConnection', () => {
    it('should throw NotFoundException when connection not found', async () => {
      await expect(service.getConnection('conn-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw when connection belongs to different user', async () => {
      vi.mocked(prisma.bunkerConnection!.findUnique!).mockResolvedValue({
        id: 'conn-1',
        userId: 'other',
      } as never);
      await expect(service.getConnection('conn-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleLogging', () => {
    it('should throw when connection not found', async () => {
      await expect(service.toggleLogging('conn-1', 'user-1', true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update logging when connection belongs to user', async () => {
      vi.mocked(prisma.bunkerConnection!.findUnique!).mockResolvedValue({
        id: 'conn-1',
        userId: 'user-1',
      } as never);
      await service.toggleLogging('conn-1', 'user-1', true);
      expect(prisma.bunkerConnection?.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: { loggingEnabled: true },
      });
    });
  });

  describe('deleteConnection', () => {
    it('should throw when connection not found', async () => {
      await expect(service.deleteConnection('conn-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should delete when connection belongs to user', async () => {
      vi.mocked(prisma.bunkerConnection!.findUnique!).mockResolvedValue({
        id: 'conn-1',
        userId: 'user-1',
      } as never);
      await service.deleteConnection('conn-1', 'user-1');
      expect(prisma.bunkerConnection?.delete).toHaveBeenCalledWith({ where: { id: 'conn-1' } });
    });
  });

  describe('deleteNsecKey', () => {
    it('should throw NotFoundException when key not found', async () => {
      await expect(service.deleteNsecKey('key-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when key has connections', async () => {
      vi.mocked(prisma.nsecKey!.findUnique!).mockResolvedValue({
        id: 'key-1',
        userId: 'user-1',
      } as never);
      vi.mocked(prisma.bunkerConnection!.count!).mockResolvedValue(1);
      await expect(service.deleteNsecKey('key-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should delete key when no connections', async () => {
      vi.mocked(prisma.nsecKey!.findUnique!).mockResolvedValue({
        id: 'key-1',
        userId: 'user-1',
      } as never);
      vi.mocked(prisma.bunkerConnection!.count!).mockResolvedValue(0);
      await service.deleteNsecKey('key-1', 'user-1');
      expect(prisma.nsecKey?.delete).toHaveBeenCalledWith({ where: { id: 'key-1' } });
    });
  });

  describe('setPermissions', () => {
    it('replaces granted permissions while preserving pending requests', async () => {
      await service.setPermissions('conn-1', [
        { method: 'sign_event', kind: 1 },
        { method: 'ping' },
      ]);
      // Only granted rows are cleared; pending rows survive.
      expect(prisma.connectionPermission?.deleteMany).toHaveBeenCalledWith({
        where: { connectionId: 'conn-1', allowed: true },
      });
      // Pending rows for the now-granted method/kinds are dropped to avoid a unique conflict.
      expect(prisma.connectionPermission?.deleteMany).toHaveBeenCalledWith({
        where: {
          connectionId: 'conn-1',
          allowed: false,
          OR: [
            { method: 'sign_event', kind: 1 },
            { method: 'ping', kind: null },
          ],
        },
      });
      expect(prisma.connectionPermission?.createMany).toHaveBeenCalledWith({
        data: [
          { connectionId: 'conn-1', method: 'sign_event', kind: 1, allowed: true },
          { connectionId: 'conn-1', method: 'ping', kind: null, allowed: true },
        ],
      });
    });
  });

  describe('requestPermissions', () => {
    it('records requested permissions as PENDING (allowed=false), skipping duplicates', async () => {
      await service.requestPermissions('conn-1', [
        { method: 'sign_event', kind: 1 },
        { method: 'nip44_decrypt' },
      ]);
      expect(prisma.connectionPermission?.createMany).toHaveBeenCalledWith({
        data: [
          { connectionId: 'conn-1', method: 'sign_event', kind: 1, allowed: false },
          { connectionId: 'conn-1', method: 'nip44_decrypt', kind: null, allowed: false },
        ],
        skipDuplicates: true,
      });
    });

    it('is a no-op for an empty request', async () => {
      await service.requestPermissions('conn-1', []);
      expect(prisma.connectionPermission?.createMany).not.toHaveBeenCalled();
    });
  });

  describe('approveRequests', () => {
    it('throws when the connection does not belong to the user', async () => {
      vi.mocked(prisma.bunkerConnection!.findUnique!).mockResolvedValue({
        id: 'conn-1',
        userId: 'other',
      } as never);
      await expect(service.approveRequests('conn-1', 'user-1')).rejects.toThrow(NotFoundException);
      expect(prisma.connectionPermission?.updateMany).not.toHaveBeenCalled();
    });

    it('approves all pending requests by flipping allowed to true', async () => {
      vi.mocked(prisma.bunkerConnection!.findUnique!).mockResolvedValue({
        id: 'conn-1',
        userId: 'user-1',
      } as never);
      await service.approveRequests('conn-1', 'user-1');
      expect(prisma.connectionPermission?.updateMany).toHaveBeenCalledWith({
        where: { connectionId: 'conn-1', allowed: false },
        data: { allowed: true },
      });
    });

    it('approves only the given subset when provided', async () => {
      vi.mocked(prisma.bunkerConnection!.findUnique!).mockResolvedValue({
        id: 'conn-1',
        userId: 'user-1',
      } as never);
      await service.approveRequests('conn-1', 'user-1', [{ method: 'nip44_decrypt' }]);
      expect(prisma.connectionPermission?.updateMany).toHaveBeenCalledWith({
        where: {
          connectionId: 'conn-1',
          allowed: false,
          OR: [{ method: 'nip44_decrypt', kind: null }],
        },
        data: { allowed: true },
      });
    });
  });

  describe('denyRequests', () => {
    it('throws when the connection does not belong to the user', async () => {
      vi.mocked(prisma.bunkerConnection!.findUnique!).mockResolvedValue({
        id: 'conn-1',
        userId: 'other',
      } as never);
      await expect(service.denyRequests('conn-1', 'user-1')).rejects.toThrow(NotFoundException);
      expect(prisma.connectionPermission?.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes pending requests for the owner', async () => {
      vi.mocked(prisma.bunkerConnection!.findUnique!).mockResolvedValue({
        id: 'conn-1',
        userId: 'user-1',
      } as never);
      await service.denyRequests('conn-1', 'user-1');
      expect(prisma.connectionPermission?.deleteMany).toHaveBeenCalledWith({
        where: { connectionId: 'conn-1', allowed: false },
      });
    });
  });

  describe('getPermissions', () => {
    it('should return mapped permissions', async () => {
      vi.mocked(prisma.connectionPermission!.findMany!).mockResolvedValue([
        { method: 'ping', kind: null },
        { method: 'sign_event', kind: 1 },
      ] as never);
      const result = await service.getPermissions('conn-1');
      expect(result).toEqual([{ method: 'ping' }, { method: 'sign_event', kind: 1 }]);
    });
  });

  describe('touchActivity', () => {
    it('should update lastActivity', async () => {
      await service.touchActivity('conn-1');
      expect(prisma.bunkerConnection?.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: { lastActivity: expect.any(Date) },
      });
    });
  });
});
