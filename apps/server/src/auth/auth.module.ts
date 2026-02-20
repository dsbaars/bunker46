import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { serverEnvSchema } from '@bunker46/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { TotpService } from './totp.service.js';
import { PasskeyService } from './passkey.service.js';
import { UsersModule } from '../users/users.module.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
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
  providers: [
    {
      provide: 'JWT_SECRET',
      useFactory: () => serverEnvSchema.parse(process.env).JWT_SECRET,
    },
    AuthService,
    JwtStrategy,
    TotpService,
    PasskeyService,
    EncryptionService,
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
