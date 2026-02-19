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
        delete: vi.fn().mockResolvedValue(undefined),
      },
      bunkerConnection: {
        create: vi.fn().mockResolvedValue({ id: 'conn-1', status: 'PENDING' }),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(undefined),
        count: vi.fn().mockResolvedValue(0),
      },
      connectionPermission: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
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
    it('should create connection and publish activity', async () => {
      await service.createConnection('user-1', 'key-1', 'client-pub', { name: 'App' });
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
      expect(eventsService.publishUserActivity).toHaveBeenCalledWith('user-1');
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
    it('should delete existing and create new permissions', async () => {
      await service.setPermissions('conn-1', [
        { method: 'sign_event', kind: 1 },
        { method: 'ping' },
      ]);
      expect(prisma.connectionPermission?.deleteMany).toHaveBeenCalledWith({
        where: { connectionId: 'conn-1' },
      });
      expect(prisma.connectionPermission?.createMany).toHaveBeenCalledWith({
        data: [
          { connectionId: 'conn-1', method: 'sign_event', kind: 1 },
          { connectionId: 'conn-1', method: 'ping', kind: null },
        ],
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
