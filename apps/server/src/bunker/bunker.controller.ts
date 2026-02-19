import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TotpVerifiedGuard } from '../auth/guards/totp-verified.guard.js';
import { BunkerService } from './bunker.service.js';
import { BunkerUriService } from './bunker-uri.service.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NOSTR_CONSTANTS } from '@bunker46/config';
import type { FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';

type AuthReq = FastifyRequest & { user: { sub: string } };

@ApiTags('bunker')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TotpVerifiedGuard)
@Controller('api/bunker')
export class BunkerController {
  constructor(
    private readonly bunkerService: BunkerService,
    private readonly uriService: BunkerUriService,
    private readonly connectionsService: ConnectionsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('parse-uri')
  async parseUri(@Body() body: { uri: string }) {
    const bunker = this.uriService.parseBunkerUri(body.uri);
    if (bunker) return { type: 'bunker', ...bunker };

    const nostrConnect = this.uriService.parseNostrConnectUri(body.uri);
    if (nostrConnect) return { type: 'nostrconnect', ...nostrConnect };

    return { type: 'invalid', error: 'Unrecognized URI format' };
  }

  @Post('generate-bunker-uri')
  async generateBunkerUri(@Req() req: AuthReq, @Body() body: { nsecKeyId: string; name?: string }) {
    const key = await this.prisma.nsecKey.findUnique({ where: { id: body.nsecKeyId } });
    if (!key || key.userId !== req.user.sub) {
      throw new Error('Key not found');
    }

    const relays = await this.getActiveRelays();
    const secret = randomBytes(16).toString('hex');

    this.bunkerService.registerPendingSecret(key.publicKey, secret, {
      userId: req.user.sub,
      nsecKeyId: body.nsecKeyId,
      name: body.name || 'Bunker46',
    });

    await this.bunkerService.ensureListeningForConnection(body.nsecKeyId, relays);

    const uri = this.uriService.buildBunkerUri(key.publicKey, relays, secret);
    return { uri, secret, signerPubkey: key.publicKey, relays };
  }

  @Get('relays')
  async getRelays() {
    const relays = await this.prisma.relayConfig.findMany({ orderBy: { createdAt: 'asc' } });
    return { relays, defaults: [...NOSTR_CONSTANTS.DEFAULT_RELAYS] };
  }

  @Post('relays')
  async setRelays(@Req() req: AuthReq, @Body() body: { relays: string[] }) {
    await this.prisma.relayConfig.deleteMany({});
    if (body.relays.length > 0) {
      await this.prisma.relayConfig.createMany({
        data: body.relays.map((url) => ({ url })),
      });
    }
    return { relays: body.relays };
  }

  @Get('status')
  async getStatus() {
    return {
      activeListeners: this.bunkerService.getActiveListenerCount(),
      pendingSecrets: this.bunkerService.getPendingSecretCount(),
    };
  }

  private async getActiveRelays(): Promise<string[]> {
    const configured = await this.prisma.relayConfig.findMany({ select: { url: true } });
    if (configured.length > 0) return configured.map((r) => r.url);
    return [...NOSTR_CONSTANTS.DEFAULT_RELAYS];
  }
}
