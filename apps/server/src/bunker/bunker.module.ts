import { Module, forwardRef } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { BunkerService } from './bunker.service.js';
import { BunkerGateway } from './bunker.gateway.js';
import { BunkerUriService } from './bunker-uri.service.js';
import { BunkerRpcHandler } from './bunker-rpc.handler.js';
import { ConnectionsModule } from '../connections/connections.module.js';
import { LoggingModule } from '../logging/logging.module.js';
import { EventsModule } from '../events/events.module.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { BunkerController } from './bunker.controller.js';

@Module({
  imports: [forwardRef(() => ConnectionsModule), LoggingModule, EventsModule],
  providers: [
    AdminGuard,
    BunkerService,
    BunkerGateway,
    BunkerUriService,
    BunkerRpcHandler,
    EncryptionService,
  ],
  controllers: [BunkerController],
  exports: [BunkerService],
})
export class BunkerModule {}
