import { Injectable, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { FastifyRequest } from 'fastify';

interface JwtPayload {
  sub: string;
  username: string;
  totpVerified: boolean;
  totpEnabled?: boolean;
  sessionId?: string;
  role?: string;
}

type RequestWithHeaders = FastifyRequest & {
  raw?: { headers?: Record<string, string | string[] | undefined> };
};

/** Extract Bearer token from Authorization header. Works with Fastify or raw Node request. */
function jwtFromRequest(req: RequestWithHeaders): string | null {
  const h = req?.headers ?? req.raw?.headers;
  if (!h) return null;
  const raw =
    (h as Record<string, string | string[] | undefined>)['authorization'] ??
    (h as Record<string, string | string[] | undefined>)['Authorization'];
  const auth = Array.isArray(raw) ? raw[0] : raw;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject('JWT_SECRET') secret: string) {
    super({
      jwtFromRequest,
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload) {
    return {
      sub: payload.sub,
      username: payload.username,
      totpVerified: payload.totpVerified,
      totpEnabled: payload.totpEnabled ?? false,
      sessionId: payload.sessionId,
      role: payload.role,
    };
  }
}
