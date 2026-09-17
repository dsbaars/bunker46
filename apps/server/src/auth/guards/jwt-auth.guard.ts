import { Injectable, Optional } from '@nestjs/common';
import { AuthGuard, AuthModuleOptions } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Nest 12 no longer inherits @Optional() metadata from a parent class (nestjs/nest#2581), so the
  // mixin's optional AuthModuleOptions param must be redeclared here. Without it, every module that
  // uses this guard without importing PassportModule fails to boot with UnknownDependenciesException.
  constructor(@Optional() options?: AuthModuleOptions) {
    super(options);
  }
}
