import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { UsersService } from '../users/users.service.js';
import * as QRCode from 'qrcode';

@Injectable()
export class TotpService {
  constructor(
    private readonly encryption: EncryptionService,
    private readonly usersService: UsersService,
  ) {}

  generateSecret(): string {
    return generateSecret();
  }

  generateOtpauthUrl(secret: string, username: string): string {
    return generateURI({ issuer: 'Bunker46', label: username, secret });
  }

  async generateQrDataUrl(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl);
  }

  verifyToken(encryptedSecret: string, token: string): boolean {
    const secret = this.encryption.decrypt(encryptedSecret);
    const result = verifySync({ token, secret });
    return result.valid;
  }

  async enableTotp(userId: string, secret: string) {
    const encryptedSecret = this.encryption.encrypt(secret);
    await this.usersService.updateTotpSecret(userId, encryptedSecret);
  }
}
