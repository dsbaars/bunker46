import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TotpVerifiedGuard } from '../auth/guards/totp-verified.guard.js';
import type { ConnectionsService } from './connections.service.js';
import { BunkerService } from '../bunker/bunker.service.js';
import { parsePermissionList, type PermissionDescriptor } from '@bunker46/shared-types';
import type { FastifyRequest } from 'fastify';

type AuthReq = FastifyRequest & { user: { sub: string } };

@ApiTags('connections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TotpVerifiedGuard)
@Controller('api/connections')
export class ConnectionsController {
  constructor(
    private readonly connectionsService: ConnectionsService,
    @Inject(forwardRef(() => BunkerService))
    private readonly bunkerService: BunkerService,
  ) {}

  @Get()
  async list(@Req() req: AuthReq) {
    return this.connectionsService.listConnections(req.user.sub);
  }

  @Get('nsec-keys')
  async listNsecKeys(@Req() req: AuthReq) {
    return this.connectionsService.getNsecKeys(req.user.sub);
  }

  @Post('nsec-keys')
  async addNsecKey(
    @Req() req: AuthReq,
    @Body() body: { nsecHex: string; publicKey: string; label?: string },
  ) {
    return this.connectionsService.addNsecKey(
      req.user.sub,
      body.nsecHex,
      body.publicKey,
      body.label ?? 'Default Key',
    );
  }

  @Delete('nsec-keys/:keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNsecKey(@Req() req: AuthReq, @Param('keyId') keyId: string) {
    await this.connectionsService.deleteNsecKey(keyId, req.user.sub);
  }

  @Get(':id')
  async get(@Req() req: AuthReq, @Param('id') id: string) {
    return this.connectionsService.getConnection(id, req.user.sub);
  }

  @Post()
  async create(
    @Req() req: AuthReq,
    @Body()
    body: {
      nsecKeyId: string;
      clientPubkey: string;
      name?: string;
      logoUrl?: string;
      relays?: string[];
      secret?: string;
      remotePubkey?: string;
      perms?: string;
      type?: 'nostrconnect' | 'bunker';
    },
  ) {
    const conn = await this.connectionsService.createConnection(
      req.user.sub,
      body.nsecKeyId,
      body.clientPubkey,
      body,
    );

    if (body.perms) {
      try {
        const permissions = parsePermissionList(body.perms);
        await this.connectionsService.setPermissions(conn.id, permissions);
      } catch {
        // Invalid perms string - continue without setting permissions
      }
    }

    await this.bunkerService.ensureListeningForConnection(body.nsecKeyId, body.relays ?? []);

    if (body.type === 'nostrconnect' && body.secret) {
      await this.bunkerService.sendConnectResponse(
        body.nsecKeyId,
        body.clientPubkey,
        body.secret,
        body.relays ?? [],
      );
      await this.connectionsService.updateConnectionStatus(conn.id, 'ACTIVE');
    }

    return this.connectionsService.getConnection(conn.id, req.user.sub);
  }

  @Put(':id/permissions')
  async setPermissions(
    @Req() req: AuthReq,
    @Param('id') id: string,
    @Body() body: { permissions: PermissionDescriptor[] },
  ) {
    await this.connectionsService.getConnection(id, req.user.sub);
    await this.connectionsService.setPermissions(id, body.permissions);
    return { success: true };
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: AuthReq,
    @Param('id') id: string,
    @Body() body: { status: 'ACTIVE' | 'REVOKED' },
  ) {
    await this.connectionsService.getConnection(id, req.user.sub);
    return this.connectionsService.updateConnectionStatus(id, body.status);
  }

  @Patch(':id/logging')
  async toggleLogging(
    @Req() req: AuthReq,
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.connectionsService.toggleLogging(id, req.user.sub, body.enabled);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: AuthReq, @Param('id') id: string) {
    await this.connectionsService.deleteConnection(id, req.user.sub);
  }
}
