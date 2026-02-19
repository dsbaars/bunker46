import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ConnectionsModule } from './connections/connections.module.js';
import { BunkerModule } from './bunker/bunker.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { EventsModule } from './events/events.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    ConnectionsModule,
    BunkerModule,
    LoggingModule,
    EventsModule,
  ],
})
export class AppModule {}
