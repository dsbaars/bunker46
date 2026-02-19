import { Module, forwardRef } from '@nestjs/common';
import { ConnectionsService } from './connections.service.js';
import { ConnectionsController } from './connections.controller.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { EventsModule } from '../events/events.module.js';
import { BunkerModule } from '../bunker/bunker.module.js';

@Module({
  imports: [forwardRef(() => BunkerModule), EventsModule],
  providers: [ConnectionsService, EncryptionService],
  controllers: [ConnectionsController],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
