import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { serverEnvSchema } from '@bunker46/config';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const env = serverEnvSchema.parse(process.env);
        return {
          secret: env.JWT_SECRET,
          signOptions: {
            expiresIn: env.JWT_EXPIRES_IN as `${number}${'s' | 'm' | 'h' | 'd'}`,
          },
        };
      },
    }),
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
