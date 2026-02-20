import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { E2eThrottlerGuard } from './common/guards/e2e-throttler.guard.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ConnectionsModule } from './connections/connections.module.js';
import { BunkerModule } from './bunker/bunker.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { EventsModule } from './events/events.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      { name: 'auth', ttl: 60_000, limit: 10 },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    ConnectionsModule,
    BunkerModule,
    LoggingModule,
    EventsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: E2eThrottlerGuard }],
})
export class AppModule {}
