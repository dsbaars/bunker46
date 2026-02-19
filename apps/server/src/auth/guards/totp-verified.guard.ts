import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class TotpVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user && user.totpVerified === false) {
      throw new ForbiddenException('TOTP verification required');
    }
    return true;
  }
}
