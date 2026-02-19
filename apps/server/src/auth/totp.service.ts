import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import type { EncryptionService } from '../common/crypto/encryption.service.js';
import type { UsersService } from '../users/users.service.js';
import * as QRCode from 'qrcode';

@Injectable()
export class TotpService {
  constructor(
    private readonly encryption: EncryptionService,
    private readonly usersService: UsersService,
  ) {}

  generateSecret(): string {
    return authenticator.generateSecret();
  }

  generateOtpauthUrl(secret: string, username: string): string {
    return authenticator.keyuri(username, 'Bunker46', secret);
  }

  async generateQrDataUrl(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl);
  }

  verifyToken(encryptedSecret: string, token: string): boolean {
    const secret = this.encryption.decrypt(encryptedSecret);
    return authenticator.verify({ token, secret });
  }

  async enableTotp(userId: string, secret: string) {
    const encryptedSecret = this.encryption.encrypt(secret);
    await this.usersService.updateTotpSecret(userId, encryptedSecret);
  }
}
