import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
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
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-me',
      signOptions: {
        expiresIn: (process.env['JWT_EXPIRES_IN'] ?? '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, TotpService, PasskeyService, EncryptionService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
