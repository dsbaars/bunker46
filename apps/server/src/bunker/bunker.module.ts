import { Module, forwardRef } from '@nestjs/common';
import { serverEnvSchema, NOSTR_DEFAULT_RELAYS_INJECTION_TOKEN } from '@bunker46/config';
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
    {
      provide: NOSTR_DEFAULT_RELAYS_INJECTION_TOKEN,
      useFactory: () => serverEnvSchema.parse(process.env).NOSTR_DEFAULT_RELAYS,
    },
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
