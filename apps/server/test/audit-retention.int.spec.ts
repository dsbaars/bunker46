import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { LoggingService } from '../src/logging/logging.service.js';
import { StatsService } from '../src/logging/stats.service.js';

/**
 * DB integration test for audit-log retention (Option B: decoupled signing logs).
 *
 * Opt-in: requires a real Postgres reachable via DATABASE_URL with the migrations applied.
 * Gated behind RUN_DB_TESTS=1 so the default `pnpm test` (no DB) stays green. See README /
 * `pnpm test:integration` for how to bring up the throwaway DB.
 *
 * Proves the guarantees that mocked unit tests cannot:
 *  - deleting a connection sets signing_logs.connection_id to NULL (ON DELETE SET NULL) instead
 *    of cascading the rows away, so the audit history survives;
 *  - the denormalized userId/connectionName/clientPubkey stay intact and keep the orphaned log
 *    scoped + readable in the dashboard activity feed;
 *  - deleting the owning user still purges their logs (the user FK cascades).
 */
const RUN = process.env['RUN_DB_TESTS'] === '1';

describe.skipIf(!RUN)('audit-log retention (DB integration)', () => {
  let prisma: PrismaService;
  let logging: LoggingService;
  let stats: StatsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    logging = new LoggingService(prisma);
    stats = new StatsService(prisma);
  });

  afterAll(async () => {
    if (prisma) await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean slate. Order matters for the non-cascade FKs.
    await prisma.signingLog.deleteMany();
    await prisma.bunkerConnection.deleteMany();
    await prisma.nsecKey.deleteMany();
    await prisma.user.deleteMany();
  });

  async function seedConnectionWithLog() {
    const user = await prisma.user.create({
      data: { username: `audit-${Date.now()}-${Math.random()}`, passwordHash: 'x' },
    });
    const nsecKey = await prisma.nsecKey.create({
      data: { userId: user.id, publicKey: `pk-${Math.random()}`, encryptedNsec: 'enc' },
    });
    const conn = await prisma.bunkerConnection.create({
      data: {
        userId: user.id,
        nsecKeyId: nsecKey.id,
        clientPubkey: `client-${Math.random()}`,
        name: 'My App',
      },
    });
    await logging.logSigningAction({
      connectionId: conn.id,
      userId: user.id,
      connectionName: conn.name,
      clientPubkey: conn.clientPubkey,
      method: 'sign_event',
      eventKind: 1,
      result: 'APPROVED',
      durationMs: 5,
    });
    return { user, conn };
  }

  it('retains signing logs (connection_id -> NULL) when the connection is deleted', async () => {
    const { user, conn } = await seedConnectionWithLog();
    expect(await prisma.signingLog.count()).toBe(1);

    await prisma.bunkerConnection.delete({ where: { id: conn.id } });

    // Connection is gone, but the audit log survives with the FK nulled out.
    expect(await prisma.bunkerConnection.count()).toBe(0);
    const logs = await prisma.signingLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.connectionId).toBeNull();
    expect(logs[0]!.userId).toBe(user.id);
    expect(logs[0]!.connectionName).toBe('My App');
    expect(logs[0]!.clientPubkey).toBe(conn.clientPubkey);

    // And it still shows up in the dashboard activity feed (scoped by denormalized userId).
    const activity = await logging.getDashboardActivity(user.id);
    expect(activity.total).toBe(1);
    expect(activity.data[0]).toMatchObject({ connectionName: 'My App', method: 'sign_event' });
  });

  it('still counts orphaned logs in dashboard stats and keeps the deleted name filterable', async () => {
    const { user, conn } = await seedConnectionWithLog();
    await prisma.bunkerConnection.delete({ where: { id: conn.id } });

    const s = await stats.getDashboardStats(user.id, '7d');

    // The orphaned log (connectionId=null) is still aggregated into counts/charts via userId...
    expect(s.signingActions7d).toBe(1);
    expect(s.signingByMethod['sign_event']).toBe(1);
    // ...and the deleted connection's name remains in the filter list (sourced from the logs).
    expect(s.connectionNames).toContain('My App');
  });

  it('purges signing logs when the owning user is deleted (user FK cascades)', async () => {
    const { user } = await seedConnectionWithLog();
    expect(await prisma.signingLog.count()).toBe(1);

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.signingLog.count()).toBe(0);
  });
});
