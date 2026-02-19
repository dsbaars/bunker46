import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { User } from '@/generated/prisma/client.js';
import { UsersService } from './users.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('hashed-password'),
  verify: vi.fn().mockResolvedValue(true),
}));

import * as argon2 from 'argon2';

const mockUser: User = {
  id: 'user-1',
  username: 'testuser',
  passwordHash: 'hash',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  totpEnabled: false,
  totpSecret: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: Partial<PrismaService>;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(mockUser),
        update: vi.fn().mockResolvedValue(mockUser),
      },
    };
    usersService = new UsersService(prisma as PrismaService);
    vi.mocked(argon2.hash).mockResolvedValue('hashed-password');
    vi.mocked(argon2.verify).mockResolvedValue(true);
  });

  describe('create', () => {
    it('should throw when username taken', async () => {
      vi.mocked(prisma.user!.findUnique!).mockResolvedValue(mockUser);
      await expect(usersService.create('testuser', 'password')).rejects.toThrow(ConflictException);
      expect(prisma.user?.create).not.toHaveBeenCalled();
    });

    it('should create user with hashed password', async () => {
      const result = await usersService.create('newuser', 'password');
      expect(prisma.user?.findUnique).toHaveBeenCalledWith({ where: { username: 'newuser' } });
      expect(argon2.hash).toHaveBeenCalledWith('password');
      expect(prisma.user?.create).toHaveBeenCalledWith({
        data: { username: 'newuser', passwordHash: 'hashed-password' },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('findByUsername', () => {
    it('should return user when found', async () => {
      vi.mocked(prisma.user!.findUnique!).mockResolvedValue(mockUser);
      const result = await usersService.findByUsername('testuser');
      expect(result).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
      const result = await usersService.findByUsername('nobody');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      vi.mocked(prisma.user!.findUnique!).mockResolvedValue(mockUser);
      const result = await usersService.findById('user-1');
      expect(result).toEqual(mockUser);
    });

    it('should throw when not found', async () => {
      await expect(usersService.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyPassword', () => {
    it('should return true when password matches', async () => {
      const result = await usersService.verifyPassword(mockUser, 'password');
      expect(result).toBe(true);
    });

    it('should return false when password does not match', async () => {
      vi.mocked(argon2.verify).mockResolvedValue(false);
      const result = await usersService.verifyPassword(mockUser, 'wrong');
      expect(result).toBe(false);
    });
  });

  describe('updatePassword', () => {
    it('should throw when current password incorrect', async () => {
      vi.mocked(prisma.user!.findUnique!).mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(false);
      await expect(usersService.updatePassword('user-1', 'wrong', 'newpass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should update password when current is correct', async () => {
      vi.mocked(prisma.user!.findUnique!).mockResolvedValue(mockUser);
      vi.mocked(prisma.user!.update!).mockResolvedValue({ ...mockUser, passwordHash: 'newhash' });
      await usersService.updatePassword('user-1', 'current', 'newpass');
      expect(prisma.user?.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'hashed-password' },
      });
    });
  });

  describe('getUserSettings', () => {
    it('should return date and time format', async () => {
      vi.mocked(prisma.user!.findUnique!).mockResolvedValue(mockUser);
      const result = await usersService.getUserSettings('user-1');
      expect(result).toEqual({ dateFormat: 'MM/DD/YYYY', timeFormat: '12h' });
    });
  });

  describe('updateUserSettings', () => {
    it('should update dateFormat and timeFormat', async () => {
      vi.mocked(prisma.user!.update!).mockResolvedValue({
        ...mockUser,
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h',
      });
      const result = await usersService.updateUserSettings('user-1', {
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h',
      });
      expect(prisma.user?.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h' },
      });
      expect(result).toEqual({ dateFormat: 'DD/MM/YYYY', timeFormat: '24h' });
    });
  });
});
