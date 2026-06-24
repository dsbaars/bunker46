import { Injectable, Logger } from '@nestjs/common';
import { ConnectionsService } from '../connections/connections.service.js';
import { LoggingService } from '../logging/logging.service.js';
import { EventsService } from '../events/events.service.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import {
  checkPermission,
  parsePermissionList,
  type PermissionDescriptor,
  type Nip46Request,
  type Nip46Response,
} from '@bunker46/shared-types';

@Injectable()
export class BunkerRpcHandler {
  private readonly logger = new Logger(BunkerRpcHandler.name);

  private pendingSecretLookup?: (
    signerPubkey: string,
    secret: string,
  ) => { userId: string; nsecKeyId: string; name: string } | undefined;

  constructor(
    private readonly connections: ConnectionsService,
    private readonly loggingService: LoggingService,
    private readonly eventsService: EventsService,
    private readonly encryption: EncryptionService,
  ) {}

  setPendingSecretLookup(
    fn: (
      signerPubkey: string,
      secret: string,
    ) => { userId: string; nsecKeyId: string; name: string } | undefined,
  ) {
    this.pendingSecretLookup = fn;
  }

  async handleRequest(
    clientPubkey: string,
    signerPubkey: string,
    request: Nip46Request,
    signEvent: (eventJson: string, nsecHex: string) => Promise<string>,
    nip04Encrypt: (plaintext: string, thirdPartyPubkey: string, nsecHex: string) => Promise<string>,
    nip04Decrypt: (
      ciphertext: string,
      thirdPartyPubkey: string,
      nsecHex: string,
    ) => Promise<string>,
    nip44Encrypt: (plaintext: string, thirdPartyPubkey: string, nsecHex: string) => Promise<string>,
    nip44Decrypt: (
      ciphertext: string,
      thirdPartyPubkey: string,
      nsecHex: string,
    ) => Promise<string>,
    getPublicKeyFromNsec: (nsecHex: string) => string,
  ): Promise<Nip46Response> {
    const start = Date.now();
    let connection = await this.connections.findByClientAndSigner(clientPubkey, signerPubkey);

    if (!connection && request.method === 'connect') {
      connection = await this.handleNewConnect(clientPubkey, signerPubkey, request);
    }

    if (!connection) {
      this.logger.warn(
        `Rejected ${request.method} from unknown client ${clientPubkey.slice(0, 12)}...`,
      );
      return { id: request.id, error: 'Unknown client' };
    }

    if (connection.status === 'REVOKED') {
      return { id: request.id, error: 'Connection revoked' };
    }

    // Only GRANTED permissions (allowed = true) are enforced. Pending requests (allowed = false),
    // recorded when a client asks for capabilities on connect, grant nothing until the operator
    // approves them in the dashboard — so a client can never self-escalate.
    const permissions: PermissionDescriptor[] = connection.permissions
      .filter((p) => p.allowed)
      .map((p) => ({
        method: p.method as PermissionDescriptor['method'],
        kind: p.kind ?? undefined,
      }));

    const nsecHex = this.encryption.decrypt(connection.nsecKey.encryptedNsec);

    let result: string | undefined;
    let error: string | undefined;
    let eventKind: number | undefined;
    // A gated method denied for want of permission is captured here and, after the request is
    // handled, recorded as a PENDING permission request the operator can approve in the dashboard.
    let deniedPermission: PermissionDescriptor | undefined;

    try {
      switch (request.method) {
        case 'connect': {
          if (connection.status === 'PENDING') {
            await this.connections.updateConnectionStatus(connection.id, 'ACTIVE');
            this.logger.log(
              `Connection ${connection.id} activated for ${clientPubkey.slice(0, 12)}...`,
            );
          }

          // Per NIP-46 a client may declare the capabilities it needs in the connect request's perms
          // param. These are a REQUEST, not a grant: we record them as PENDING for the operator to
          // approve in the dashboard (interactive approval). They grant nothing until approved, so a
          // client can never self-escalate — only the seeded/operator-granted permissions are enforced.
          // Already-granted (or already-pending) method/kinds are skipped, so re-connects are idempotent.
          const connectPerms = request.params[2];
          if (connectPerms) {
            try {
              const parsed = parsePermissionList(connectPerms);
              if (parsed.length > 0) {
                await this.connections.requestPermissions(connection.id, parsed);
                this.logger.log(
                  `Recorded ${parsed.length} pending permission request(s) from connect for ${clientPubkey.slice(0, 12)}...: ${connectPerms}`,
                );
              }
            } catch {
              this.logger.warn(`Failed to parse perms from connect: ${connectPerms}`);
            }
          }

          result = connection.secret || 'ack';
          break;
        }

        case 'ping': {
          result = 'pong';
          break;
        }

        case 'get_public_key': {
          result = getPublicKeyFromNsec(nsecHex);
          break;
        }

        case 'sign_event': {
          const eventJson = request.params[0];
          if (!eventJson) {
            error = 'Missing event parameter';
            break;
          }
          const parsed = JSON.parse(eventJson);
          eventKind = parsed.kind;

          this.logger.log(
            `sign_event kind:${eventKind} from ${clientPubkey.slice(0, 12)}... (conn: ${connection.name})`,
          );

          // Default-deny: every capability method (sign_event, nip04/nip44 encrypt/decrypt) requires
          // an explicit matching permission. A connection with no stored permissions can perform none
          // of them — unlike the previous fail-open behaviour where an empty set allowed everything.
          if (!checkPermission(permissions, { method: 'sign_event', kind: eventKind })) {
            error = `Permission denied for sign_event kind:${eventKind}`;
            deniedPermission = { method: 'sign_event', kind: eventKind };
            break;
          }

          result = await signEvent(eventJson, nsecHex);
          break;
        }

        case 'nip04_encrypt': {
          if (!checkPermission(permissions, { method: 'nip04_encrypt' })) {
            error = 'Permission denied for nip04_encrypt';
            deniedPermission = { method: 'nip04_encrypt' };
            break;
          }
          const [tp04e, pt04] = request.params;
          if (!tp04e || !pt04) {
            error = 'Missing parameters';
            break;
          }
          result = await nip04Encrypt(pt04, tp04e, nsecHex);
          break;
        }

        case 'nip04_decrypt': {
          if (!checkPermission(permissions, { method: 'nip04_decrypt' })) {
            error = 'Permission denied for nip04_decrypt';
            deniedPermission = { method: 'nip04_decrypt' };
            break;
          }
          const [tp04d, ct04] = request.params;
          if (!tp04d || !ct04) {
            error = 'Missing parameters';
            break;
          }
          result = await nip04Decrypt(ct04, tp04d, nsecHex);
          break;
        }

        case 'nip44_encrypt': {
          if (!checkPermission(permissions, { method: 'nip44_encrypt' })) {
            error = 'Permission denied for nip44_encrypt';
            deniedPermission = { method: 'nip44_encrypt' };
            break;
          }
          const [tp44e, pt44] = request.params;
          if (!tp44e || !pt44) {
            error = 'Missing parameters';
            break;
          }
          result = await nip44Encrypt(pt44, tp44e, nsecHex);
          break;
        }

        case 'nip44_decrypt': {
          if (!checkPermission(permissions, { method: 'nip44_decrypt' })) {
            error = 'Permission denied for nip44_decrypt';
            deniedPermission = { method: 'nip44_decrypt' };
            break;
          }
          const [tp44d, ct44] = request.params;
          if (!tp44d || !ct44) {
            error = 'Missing parameters';
            break;
          }
          result = await nip44Decrypt(ct44, tp44d, nsecHex);
          break;
        }

        case 'switch_relays': {
          result = connection.relays.length > 0 ? JSON.stringify(connection.relays) : 'null';
          break;
        }

        default:
          error = `Unknown method: ${request.method}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Internal error';
      this.logger.error(`RPC error for ${request.method}: ${error}`);
    }

    const durationMs = Date.now() - start;
    await this.connections.touchActivity(connection.id);

    // Surface a denied gated request as a PENDING permission request (allowed = false) so the operator
    // can approve it in the dashboard — the interactive approval flow extended to capabilities the
    // client exercises at runtime, not just those it declared on connect. Recorded with skipDuplicates,
    // so a client retrying the same method/kind cannot spam the queue, and it never downgrades a grant.
    if (deniedPermission) {
      try {
        await this.connections.requestPermissions(connection.id, [deniedPermission]);
      } catch (err) {
        this.logger.warn(`Failed to record pending permission request: ${err}`);
      }
    }

    await this.loggingService.logSigningAction({
      connectionId: connection.id,
      userId: connection.userId,
      connectionName: connection.name,
      clientPubkey: connection.clientPubkey,
      method: request.method,
      eventKind,
      result: error ? 'ERROR' : 'APPROVED',
      durationMs,
      errorMessage: error,
    });
    await this.eventsService.publishUserActivity(connection.userId);

    return { id: request.id, result, error };
  }

  private async handleNewConnect(
    clientPubkey: string,
    signerPubkey: string,
    request: Nip46Request,
  ) {
    const secret = request.params[1];

    if (!this.pendingSecretLookup) {
      this.logger.debug(`No pending secret lookup configured`);
      return null;
    }

    if (!secret) {
      this.logger.debug(
        `No secret in connect from ${clientPubkey.slice(0, 12)}..., trying without`,
      );
      return null;
    }

    const info = this.pendingSecretLookup(signerPubkey, secret);
    if (!info) {
      this.logger.warn(
        `No matching pending secret for connect from ${clientPubkey.slice(0, 12)}...`,
      );
      return null;
    }

    this.logger.log(
      `Auto-creating connection for ${clientPubkey.slice(0, 12)}... via bunker:// URI`,
    );

    try {
      await this.connections.createConnection(info.userId, info.nsecKeyId, clientPubkey, {
        name: info.name,
        relays: [],
        secret,
      });

      return this.connections.findByClientAndSigner(clientPubkey, signerPubkey);
    } catch (err) {
      this.logger.error(`Failed to auto-create connection: ${err}`);
      return null;
    }
  }
}
