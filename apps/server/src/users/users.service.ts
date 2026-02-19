import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import * as argon2 from 'argon2';
import type { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(username: string, password: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const passwordHash = await argon2.hash(password);
    return this.prisma.user.create({
      data: { username, passwordHash },
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return argon2.verify(user.passwordHash, password);
  }

  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findById(userId);
    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async updateTotpSecret(userId: string, encryptedSecret: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptedSecret, totpEnabled: true },
    });
  }

  async disableTotp(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabled: false },
    });
  }

  async getUserSettings(userId: string): Promise<{ dateFormat: string; timeFormat: string }> {
    const user = await this.findById(userId);
    return { dateFormat: user.dateFormat, timeFormat: user.timeFormat };
  }

  async updateUserSettings(
    userId: string,
    dto: { dateFormat?: string; timeFormat?: string },
  ): Promise<{ dateFormat: string; timeFormat: string }> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.dateFormat !== undefined && { dateFormat: dto.dateFormat }),
        ...(dto.timeFormat !== undefined && { timeFormat: dto.timeFormat }),
      },
    });
    return { dateFormat: user.dateFormat, timeFormat: user.timeFormat };
  }
}
