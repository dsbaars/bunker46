import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from '@noble/hashes/utils.js';
import * as nip44 from 'nostr-tools/nip44';
import * as nip04 from 'nostr-tools/nip04';
import { BunkerRpcHandler } from './bunker-rpc.handler.js';
import { Nip46RequestSchema, SafeRelayUrlSchema } from '@bunker46/shared-types';
import { NOSTR_CONSTANTS } from '@bunker46/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket);

interface ActiveListener {
  relays: string[];
  close: () => void;
}

export interface PendingSecretInfo {
  userId: string;
  nsecKeyId: string;
  name: string;
}

@Injectable()
export class BunkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BunkerService.name);
  private pool: SimplePool;
  private activeListeners = new Map<string, ActiveListener>();
  private pendingSecrets = new Map<string, PendingSecretInfo>();

  constructor(
    private readonly rpcHandler: BunkerRpcHandler,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {
    this.pool = new SimplePool({ enablePing: true, enableReconnect: true });
  }

  async onModuleInit() {
    this.logger.log('Bunker service initializing – resuming relay listeners...');

    this.rpcHandler.setPendingSecretLookup((signerPubkey, secret) => {
      return this.consumePendingSecret(signerPubkey, secret);
    });

    await this.resumeAllListeners();
  }

  async onModuleDestroy() {
    for (const [pubkey, listener] of this.activeListeners) {
      listener.close();
      this.logger.debug(`Stopped listener for ${pubkey.slice(0, 12)}...`);
    }
    this.activeListeners.clear();
    this.pool.close([...NOSTR_CONSTANTS.DEFAULT_RELAYS]);
  }

  registerPendingSecret(signerPubkey: string, secret: string, info: PendingSecretInfo) {
    const key = `${signerPubkey}:${secret}`;
    this.pendingSecrets.set(key, info);
    setTimeout(() => this.pendingSecrets.delete(key), 10 * 60 * 1000);
    this.logger.debug(`Registered pending secret for ${signerPubkey.slice(0, 12)}...`);
  }

  consumePendingSecret(signerPubkey: string, secret: string): PendingSecretInfo | undefined {
    const key = `${signerPubkey}:${secret}`;
    const info = this.pendingSecrets.get(key);
    if (info) this.pendingSecrets.delete(key);
    return info;
  }

  getPendingSecretCount(): number {
    return this.pendingSecrets.size;
  }

  private async resumeAllListeners() {
    const nsecKeys = await this.prisma.nsecKey.findMany({
      include: {
        connections: {
          where: { status: { in: ['ACTIVE', 'PENDING'] } },
          select: { relays: true },
        },
      },
    });

    const configuredRelays = await this.prisma.relayConfig.findMany({ select: { url: true } });
    const baseRelays =
      configuredRelays.length > 0
        ? configuredRelays.map((r) => r.url)
        : [...NOSTR_CONSTANTS.DEFAULT_RELAYS];

    for (const key of nsecKeys) {
      const nsecHex = this.encryption.decrypt(key.encryptedNsec);
      const allRelays = new Set<string>(baseRelays);
      for (const conn of key.connections) {
        for (const r of conn.relays) allRelays.add(r);
      }

      this.startListeningForKey(key.publicKey, nsecHex, [...allRelays]);
    }

    this.logger.log(
      `Resumed listeners for ${nsecKeys.length} nsec key(s) on ${baseRelays.join(', ')}`,
    );
  }

  startListeningForKey(signerPubkeyHex: string, signerNsecHex: string, relays: string[]): void {
    const rawRelays = relays.length > 0 ? relays : [...NOSTR_CONSTANTS.DEFAULT_RELAYS];
    const effectiveRelays = rawRelays.filter((url) => {
      const result = SafeRelayUrlSchema.safeParse(url);
      if (!result.success) {
        this.logger.warn(`Skipping unsafe relay URL (SSRF): ${url.slice(0, 50)}...`);
        return false;
      }
      return true;
    });
    if (effectiveRelays.length === 0) {
      this.logger.warn('No safe relay URLs left after filtering; using defaults');
      effectiveRelays.push(...NOSTR_CONSTANTS.DEFAULT_RELAYS);
    }

    const existing = this.activeListeners.get(signerPubkeyHex);
    if (existing) {
      const newRelays = effectiveRelays.filter((r) => !existing.relays.includes(r));
      if (newRelays.length === 0) {
        return;
      }
      existing.close();
      this.activeListeners.delete(signerPubkeyHex);
      const mergedRelays = [...new Set([...existing.relays, ...effectiveRelays])];
      return this.startListeningForKey(signerPubkeyHex, signerNsecHex, mergedRelays);
    }

    const sub = this.pool.subscribe(
      effectiveRelays,
      { kinds: [NOSTR_CONSTANTS.NIP46_KIND], '#p': [signerPubkeyHex] },
      {
        onevent: async (event) => {
          try {
            await this.handleIncomingEvent(event, signerNsecHex, signerPubkeyHex, effectiveRelays);
          } catch (err) {
            this.logger.error(`Error handling NIP-46 event: ${err}`);
          }
        },
      },
    );

    this.activeListeners.set(signerPubkeyHex, {
      relays: effectiveRelays,
      close: () => sub.close(),
    });

    this.logger.log(
      `Listening for NIP-46 on ${effectiveRelays.join(', ')} for ${signerPubkeyHex.slice(0, 12)}...`,
    );
  }

  async ensureListeningForConnection(nsecKeyId: string, connectionRelays: string[]) {
    const key = await this.prisma.nsecKey.findUnique({ where: { id: nsecKeyId } });
    if (!key) return;

    const nsecHex = this.encryption.decrypt(key.encryptedNsec);

    const configuredRelays = await this.prisma.relayConfig.findMany({ select: { url: true } });
    const baseRelays =
      configuredRelays.length > 0
        ? configuredRelays.map((r) => r.url)
        : [...NOSTR_CONSTANTS.DEFAULT_RELAYS];

    const relays = [...new Set([...connectionRelays, ...baseRelays])];
    this.startListeningForKey(key.publicKey, nsecHex, relays);
  }

  stopListeningForKey(signerPubkeyHex: string) {
    const listener = this.activeListeners.get(signerPubkeyHex);
    if (listener) {
      listener.close();
      this.activeListeners.delete(signerPubkeyHex);
      this.logger.log(`Stopped listener for ${signerPubkeyHex.slice(0, 12)}...`);
    }
  }

  isListening(signerPubkeyHex: string): boolean {
    return this.activeListeners.has(signerPubkeyHex);
  }

  getActiveListenerCount(): number {
    return this.activeListeners.size;
  }

  private async handleIncomingEvent(
    event: { pubkey: string; content: string },
    signerNsecHex: string,
    signerPubkeyHex: string,
    relays: string[],
  ) {
    const signerSecretKey = hexToBytes(signerNsecHex);
    const clientPubkey = event.pubkey;

    let decryptedContent: string;
    try {
      const conversationKey = nip44.v2.utils.getConversationKey(signerSecretKey, clientPubkey);
      decryptedContent = nip44.v2.decrypt(event.content, conversationKey);
    } catch {
      try {
        decryptedContent = await nip04.decrypt(signerSecretKey, clientPubkey, event.content);
      } catch {
        this.logger.warn(`Failed to decrypt NIP-46 message from ${clientPubkey.slice(0, 12)}...`);
        return;
      }
    }

    let parsed;
    try {
      parsed = Nip46RequestSchema.safeParse(JSON.parse(decryptedContent));
    } catch {
      this.logger.warn(`Failed to parse NIP-46 JSON from ${clientPubkey.slice(0, 12)}...`);
      return;
    }

    if (!parsed.success) {
      this.logger.warn(`Invalid NIP-46 request schema from ${clientPubkey.slice(0, 12)}...`);
      return;
    }

    this.logger.log(
      `NIP-46 ${parsed.data.method} from ${clientPubkey.slice(0, 12)}... (id: ${parsed.data.id})`,
    );

    const response = await this.rpcHandler.handleRequest(
      clientPubkey,
      signerPubkeyHex,
      parsed.data,
      async (eventJson, nsec) => {
        const template = JSON.parse(eventJson);
        const sk = hexToBytes(nsec);
        return JSON.stringify(finalizeEvent(template, sk));
      },
      async (plaintext, thirdParty, nsec) => nip04.encrypt(hexToBytes(nsec), thirdParty, plaintext),
      async (ciphertext, thirdParty, nsec) =>
        nip04.decrypt(hexToBytes(nsec), thirdParty, ciphertext),
      async (plaintext, thirdParty, nsec) => {
        const ck = nip44.v2.utils.getConversationKey(hexToBytes(nsec), thirdParty);
        return nip44.v2.encrypt(plaintext, ck);
      },
      async (ciphertext, thirdParty, nsec) => {
        const ck = nip44.v2.utils.getConversationKey(hexToBytes(nsec), thirdParty);
        return nip44.v2.decrypt(ciphertext, ck);
      },
      (nsec) => getPublicKey(hexToBytes(nsec)),
    );

    const responseJson = JSON.stringify(response);
    const conversationKey = nip44.v2.utils.getConversationKey(signerSecretKey, clientPubkey);
    const encryptedResponse = nip44.v2.encrypt(responseJson, conversationKey);

    const responseEvent = finalizeEvent(
      {
        kind: NOSTR_CONSTANTS.NIP46_KIND,
        content: encryptedResponse,
        tags: [['p', clientPubkey]],
        created_at: Math.floor(Date.now() / 1000),
      },
      signerSecretKey,
    );

    try {
      await Promise.any(this.pool.publish(relays, responseEvent));
      this.logger.log(
        `NIP-46 response sent for ${parsed.data.method} to ${clientPubkey.slice(0, 12)}...`,
      );
    } catch (err) {
      this.logger.error(`Failed to publish NIP-46 response: ${err}`);
    }
  }

  async sendConnectResponse(
    nsecKeyId: string,
    clientPubkey: string,
    secret: string,
    relays: string[],
  ) {
    const key = await this.prisma.nsecKey.findUnique({ where: { id: nsecKeyId } });
    if (!key) {
      this.logger.error('sendConnectResponse: nsec key not found');
      return;
    }

    const nsecHex = this.encryption.decrypt(key.encryptedNsec);
    const signerSecretKey = hexToBytes(nsecHex);

    const configuredRelays = await this.prisma.relayConfig.findMany({ select: { url: true } });
    const baseRelays =
      configuredRelays.length > 0
        ? configuredRelays.map((r) => r.url)
        : [...NOSTR_CONSTANTS.DEFAULT_RELAYS];
    const effectiveRelays = [...new Set([...relays, ...baseRelays])];

    const responsePayload = JSON.stringify({
      id: crypto.randomUUID(),
      result: secret,
    });

    const conversationKey = nip44.v2.utils.getConversationKey(signerSecretKey, clientPubkey);
    const encryptedResponse = nip44.v2.encrypt(responsePayload, conversationKey);

    const responseEvent = finalizeEvent(
      {
        kind: NOSTR_CONSTANTS.NIP46_KIND,
        content: encryptedResponse,
        tags: [['p', clientPubkey]],
        created_at: Math.floor(Date.now() / 1000),
      },
      signerSecretKey,
    );

    try {
      await Promise.any(this.pool.publish(effectiveRelays, responseEvent));
      this.logger.log(
        `Sent nostrconnect response to ${clientPubkey.slice(0, 12)}... on ${effectiveRelays.join(', ')}`,
      );
    } catch (err) {
      this.logger.error(`Failed to publish nostrconnect response: ${err}`);
    }
  }

  getPool(): SimplePool {
    return this.pool;
  }
}
