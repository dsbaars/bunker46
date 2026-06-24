import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { EventsService } from '../events/events.service.js';
import type { ConnectionStatus as PrismaConnectionStatus } from '@/generated/prisma/client.js';
import { DEFAULT_CONNECTION_PERMISSIONS, type PermissionDescriptor } from '@bunker46/shared-types';

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly eventsService: EventsService,
  ) {}

  async addNsecKey(userId: string, nsecHex: string, publicKey: string, label: string) {
    const encryptedNsec = this.encryption.encrypt(nsecHex);
    return this.prisma.nsecKey.create({
      data: { userId, publicKey, encryptedNsec, label },
    });
  }

  async getNsecKeys(userId: string) {
    return this.prisma.nsecKey.findMany({
      where: { userId },
      select: { id: true, publicKey: true, label: true, createdAt: true },
    });
  }

  async getDecryptedNsec(nsecKeyId: string, userId: string): Promise<string> {
    const key = await this.prisma.nsecKey.findUnique({ where: { id: nsecKeyId } });
    if (!key || key.userId !== userId) throw new ForbiddenException('Not your key');
    return this.encryption.decrypt(key.encryptedNsec);
  }

  async createConnection(
    userId: string,
    nsecKeyId: string,
    clientPubkey: string,
    data: {
      name?: string;
      logoUrl?: string;
      relays?: string[];
      secret?: string;
      remotePubkey?: string;
    },
  ) {
    // Authorization (C1): bind a connection only to an nsec key the caller actually owns. Without
    // this, an authenticated user could create a connection referencing another user's nsecKeyId and
    // have the bunker sign/decrypt with the victim's private key. Scope the lookup by userId so a
    // foreign or non-existent key is indistinguishable.
    const key = await this.prisma.nsecKey.findFirst({ where: { id: nsecKeyId, userId } });
    if (!key) throw new NotFoundException('Key not found');

    const conn = await this.prisma.bunkerConnection.create({
      data: {
        userId,
        nsecKeyId,
        clientPubkey,
        name: data.name ?? 'Unnamed Connection',
        logoUrl: data.logoUrl,
        relays: data.relays ?? [],
        secret: data.secret,
        remotePubkey: data.remotePubkey,
        status: 'PENDING',
      },
    });

    // Seed a conservative default permission set so the connection is usable under the default-deny
    // RPC handler without being fail-open. Callers with an explicit permission list (controller
    // body.perms / the connect request's perms param) overwrite these via setPermissions afterwards.
    await this.prisma.connectionPermission.createMany({
      data: DEFAULT_CONNECTION_PERMISSIONS.map((p) => ({
        connectionId: conn.id,
        method: p.method,
        kind: p.kind ?? null,
      })),
    });

    await this.eventsService.publishUserActivity(userId);

    return this.prisma.bunkerConnection.findUniqueOrThrow({
      where: { id: conn.id },
      include: { permissions: true },
    });
  }

  async listConnections(userId: string) {
    return this.prisma.bunkerConnection.findMany({
      where: { userId },
      include: {
        permissions: true,
        nsecKey: { select: { publicKey: true, label: true } },
        _count: { select: { logs: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getConnection(connectionId: string, userId: string) {
    const conn = await this.prisma.bunkerConnection.findUnique({
      where: { id: connectionId },
      include: {
        permissions: true,
        nsecKey: { select: { publicKey: true, label: true } },
        logs: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!conn || conn.userId !== userId) throw new NotFoundException('Connection not found');
    return conn;
  }

  async updateConnectionStatus(connectionId: string, status: PrismaConnectionStatus) {
    return this.prisma.bunkerConnection.update({
      where: { id: connectionId },
      data: { status },
    });
  }

  async setPermissions(connectionId: string, permissions: PermissionDescriptor[]) {
    await this.prisma.connectionPermission.deleteMany({ where: { connectionId } });
    if (permissions.length > 0) {
      await this.prisma.connectionPermission.createMany({
        data: permissions.map((p) => ({
          connectionId,
          method: p.method,
          kind: p.kind ?? null,
        })),
      });
    }
  }

  async getPermissions(connectionId: string): Promise<PermissionDescriptor[]> {
    const perms = await this.prisma.connectionPermission.findMany({
      where: { connectionId },
    });
    return perms.map((p) => ({
      method: p.method as PermissionDescriptor['method'],
      kind: p.kind ?? undefined,
    }));
  }

  async toggleLogging(connectionId: string, userId: string, enabled: boolean) {
    const conn = await this.prisma.bunkerConnection.findUnique({ where: { id: connectionId } });
    if (!conn || conn.userId !== userId) throw new NotFoundException();
    return this.prisma.bunkerConnection.update({
      where: { id: connectionId },
      data: { loggingEnabled: enabled },
    });
  }

  async touchActivity(connectionId: string) {
    await this.prisma.bunkerConnection.update({
      where: { id: connectionId },
      data: { lastActivity: new Date() },
    });
  }

  async deleteConnection(connectionId: string, userId: string) {
    const conn = await this.prisma.bunkerConnection.findUnique({ where: { id: connectionId } });
    if (!conn || conn.userId !== userId) throw new NotFoundException();
    await this.prisma.bunkerConnection.delete({ where: { id: connectionId } });
  }

  async updateNsecKeyLabel(nsecKeyId: string, userId: string, label: string) {
    const key = await this.prisma.nsecKey.findUnique({ where: { id: nsecKeyId } });
    if (!key || key.userId !== userId) throw new NotFoundException('Key not found');
    return this.prisma.nsecKey.update({
      where: { id: nsecKeyId },
      data: { label },
      select: { id: true, publicKey: true, label: true, createdAt: true },
    });
  }

  async deleteNsecKey(nsecKeyId: string, userId: string) {
    const key = await this.prisma.nsecKey.findUnique({ where: { id: nsecKeyId } });
    if (!key || key.userId !== userId) throw new NotFoundException('Key not found');
    const connectionCount = await this.prisma.bunkerConnection.count({ where: { nsecKeyId } });
    if (connectionCount > 0) {
      throw new ForbiddenException(
        'Cannot delete key with active connections. Remove connections first.',
      );
    }
    await this.prisma.nsecKey.delete({ where: { id: nsecKeyId } });
  }

  /**
   * Resolve the connection for an incoming NIP-46 request by BOTH the client pubkey and the signer
   * key the request was addressed to (the relay #p tag / listener key). Binding on the signer key
   * (M1) prevents key-confusion: a client that holds connections to several of the user's keys
   * cannot have a request addressed to key A served by a connection bound to key B — which could
   * sign/decrypt with the wrong key under a different, possibly broader permission set.
   */
  async findByClientAndSigner(clientPubkey: string, signerPubkey: string) {
    return this.prisma.bunkerConnection.findFirst({
      where: {
        clientPubkey,
        status: { in: ['ACTIVE', 'PENDING'] },
        nsecKey: { publicKey: signerPubkey },
      },
      include: { permissions: true, nsecKey: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllConnectionsForNsecKey(nsecKeyId: string) {
    return this.prisma.bunkerConnection.findMany({
      where: { nsecKeyId, status: { in: ['ACTIVE', 'PENDING'] } },
      select: { relays: true },
    });
  }
}
