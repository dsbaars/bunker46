import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import * as argon2 from 'argon2';
import { Prisma } from '@/generated/prisma/client.js';
import type { User } from '@/generated/prisma/client.js';

@Injectable()
export class UsersService {
  /**
   * Stable advisory-lock key that serializes account registration so the
   * "first account only" bootstrap gate is atomic.
   */
  private static readonly REGISTRATION_LOCK_KEY = 4_621_046;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a user account.
   *
   * When `allowWhenUsersExist` is false — the first-run bootstrap path where
   * public registration is disabled — creation is only permitted while the
   * users table is empty. The count check and the insert run inside one
   * transaction guarded by a Postgres advisory lock, so two concurrent
   * bootstrap requests cannot both observe an empty table and each create an
   * account.
   */
  async create(
    username: string,
    password: string,
    options: { allowWhenUsersExist?: boolean } = {},
  ): Promise<User> {
    const { allowWhenUsersExist = true } = options;
    // Hash before opening the transaction so the slow argon2 work does not hold
    // the advisory lock.
    const passwordHash = await argon2.hash(password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize registrations against each other; the lock auto-releases
        // when the transaction commits or rolls back.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${UsersService.REGISTRATION_LOCK_KEY})`;

        if (!allowWhenUsersExist && (await tx.user.count()) > 0) {
          throw new ForbiddenException('Registration is disabled');
        }

        const existing = await tx.user.findUnique({ where: { username } });
        if (existing) {
          throw new ConflictException('Username already taken');
        }

        return tx.user.create({ data: { username, passwordHash } });
      });
    } catch (err) {
      // Lost a same-username race past the findUnique check: the unique index is
      // the final arbiter. Surface the friendly 409 instead of a raw 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Username already taken');
      }
      throw err;
    }
  }

  async count(): Promise<number> {
    return this.prisma.user.count();
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getPasskeyCount(userId: string): Promise<number> {
    return this.prisma.passkey.count({ where: { userId } });
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return argon2.verify(user.passwordHash, password);
  }

  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    keepSessionId?: string,
  ): Promise<void> {
    const user = await this.findById(userId);
    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    // H1: invalidate every other refresh-token session so a leaked or stale token cannot survive a
    // password change — the canonical post-compromise remediation. Access tokens are stateless and
    // expire on their own (~15m); this kills the long-lived refresh sessions. The caller's current
    // session is preserved so the user who just changed their password stays signed in here.
    await this.prisma.session.deleteMany({
      where: keepSessionId ? { userId, id: { not: keepSessionId } } : { userId },
    });
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
