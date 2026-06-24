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
    /**
     * Operator-chosen permission seed (granted). When the operator picks permissions while generating
     * a bunker:// URI, those are the authoritative grants for the auto-created connection. Omitted (or
     * empty) falls back to DEFAULT_CONNECTION_PERMISSIONS so a connection is never left fail-open.
     */
    seedPermissions?: PermissionDescriptor[],
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

    // Seed the connection's granted permissions so it is usable under the default-deny RPC handler
    // without being fail-open. Prefer the operator's explicit choice (e.g. picked while generating the
    // bunker:// URI); otherwise fall back to a conservative default set. Callers with an explicit list
    // (controller body.perms / the connect request's perms param) can still adjust these afterwards.
    const seed =
      seedPermissions && seedPermissions.length > 0
        ? seedPermissions
        : DEFAULT_CONNECTION_PERMISSIONS;
    await this.prisma.connectionPermission.createMany({
      data: seed.map((p) => ({
        connectionId: conn.id,
        method: p.method,
        kind: p.kind ?? null,
        allowed: true,
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

  /**
   * Replace the connection's GRANTED permission set (operator-authoritative). Granted rows
   * (`allowed = true`) are what the signer actually enforces, as a whitelist under the default-deny
   * RPC handler. Pending requests (`allowed = false`) are PRESERVED, so editing the whitelist never
   * silently discards a client's outstanding permission request.
   */
  async setPermissions(connectionId: string, permissions: PermissionDescriptor[]) {
    await this.prisma.connectionPermission.deleteMany({ where: { connectionId, allowed: true } });
    if (permissions.length > 0) {
      // Drop any pending row that is now being granted, to satisfy the (connectionId, method, kind)
      // unique constraint before inserting the granted rows.
      await this.prisma.connectionPermission.deleteMany({
        where: {
          connectionId,
          allowed: false,
          OR: permissions.map((p) => ({ method: p.method, kind: p.kind ?? null })),
        },
      });
      await this.prisma.connectionPermission.createMany({
        data: permissions.map((p) => ({
          connectionId,
          method: p.method,
          kind: p.kind ?? null,
          allowed: true,
        })),
      });
    }
  }

  /**
   * Record permissions a client requested on `connect` as PENDING (`allowed = false`) for the operator
   * to approve. Pending rows do NOT grant anything (the handler enforces only `allowed = true`), so a
   * client can never self-escalate. Rows that already exist (granted or pending) for the same
   * method/kind are skipped, so this never downgrades a granted permission and is idempotent.
   */
  async requestPermissions(connectionId: string, permissions: PermissionDescriptor[]) {
    if (permissions.length === 0) return;
    await this.prisma.connectionPermission.createMany({
      data: permissions.map((p) => ({
        connectionId,
        method: p.method,
        kind: p.kind ?? null,
        allowed: false,
      })),
      skipDuplicates: true,
    });
  }

  /** Operator approves pending permission requests (all, or a given subset), turning them into grants. */
  async approveRequests(
    connectionId: string,
    userId: string,
    permissions?: PermissionDescriptor[],
  ) {
    const conn = await this.prisma.bunkerConnection.findUnique({ where: { id: connectionId } });
    if (!conn || conn.userId !== userId) throw new NotFoundException();
    await this.prisma.connectionPermission.updateMany({
      where: {
        connectionId,
        allowed: false,
        ...(permissions?.length
          ? { OR: permissions.map((p) => ({ method: p.method, kind: p.kind ?? null })) }
          : {}),
      },
      data: { allowed: true },
    });
    await this.eventsService.publishUserActivity(userId);
  }

  /** Operator denies (deletes) pending permission requests (all, or a given subset). */
  async denyRequests(connectionId: string, userId: string, permissions?: PermissionDescriptor[]) {
    const conn = await this.prisma.bunkerConnection.findUnique({ where: { id: connectionId } });
    if (!conn || conn.userId !== userId) throw new NotFoundException();
    await this.prisma.connectionPermission.deleteMany({
      where: {
        connectionId,
        allowed: false,
        ...(permissions?.length
          ? { OR: permissions.map((p) => ({ method: p.method, kind: p.kind ?? null })) }
          : {}),
      },
    });
    await this.eventsService.publishUserActivity(userId);
  }

  async getPermissions(connectionId: string): Promise<PermissionDescriptor[]> {
    const perms = await this.prisma.connectionPermission.findMany({
      where: { connectionId, allowed: true },
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
