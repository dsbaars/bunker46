import { Injectable, Logger } from '@nestjs/common';
import type { ConnectionsService } from '../connections/connections.service.js';
import type { LoggingService } from '../logging/logging.service.js';
import type { EncryptionService } from '../common/crypto/encryption.service.js';
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
    let connection = await this.connections.findByClientPubkey(clientPubkey);

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

    const permissions: PermissionDescriptor[] = connection.permissions.map((p) => ({
      method: p.method as PermissionDescriptor['method'],
      kind: p.kind ?? undefined,
    }));

    const nsecHex = this.encryption.decrypt(connection.nsecKey.encryptedNsec);

    let result: string | undefined;
    let error: string | undefined;
    let eventKind: number | undefined;

    try {
      switch (request.method) {
        case 'connect': {
          if (connection.status === 'PENDING') {
            await this.connections.updateConnectionStatus(connection.id, 'ACTIVE');
            this.logger.log(
              `Connection ${connection.id} activated for ${clientPubkey.slice(0, 12)}...`,
            );
          }

          const connectPerms = request.params[2];
          if (connectPerms) {
            try {
              const parsed = parsePermissionList(connectPerms);
              if (parsed.length > 0) {
                await this.connections.setPermissions(connection.id, parsed);
                this.logger.log(
                  `Stored ${parsed.length} permissions from connect for ${clientPubkey.slice(0, 12)}...: ${connectPerms}`,
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

          if (
            permissions.length > 0 &&
            !checkPermission(permissions, { method: 'sign_event', kind: eventKind })
          ) {
            error = `Permission denied for sign_event kind:${eventKind}`;
            break;
          }

          result = await signEvent(eventJson, nsecHex);
          break;
        }

        case 'nip04_encrypt': {
          if (
            permissions.length > 0 &&
            !checkPermission(permissions, { method: 'nip04_encrypt' })
          ) {
            error = 'Permission denied for nip04_encrypt';
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
          if (
            permissions.length > 0 &&
            !checkPermission(permissions, { method: 'nip04_decrypt' })
          ) {
            error = 'Permission denied for nip04_decrypt';
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
          if (
            permissions.length > 0 &&
            !checkPermission(permissions, { method: 'nip44_encrypt' })
          ) {
            error = 'Permission denied for nip44_encrypt';
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
          if (
            permissions.length > 0 &&
            !checkPermission(permissions, { method: 'nip44_decrypt' })
          ) {
            error = 'Permission denied for nip44_decrypt';
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

    await this.loggingService.logSigningAction({
      connectionId: connection.id,
      method: request.method,
      eventKind,
      result: error ? 'ERROR' : 'APPROVED',
      durationMs,
      errorMessage: error,
    });

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

      return this.connections.findByClientPubkey(clientPubkey);
    } catch (err) {
      this.logger.error(`Failed to auto-create connection: ${err}`);
      return null;
    }
  }
}
