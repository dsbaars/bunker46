import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import { PrismaService } from '../prisma/prisma.service.js';

interface StoredChallenge {
  challenge: string;
  expiresAt: number;
}

/** How long a generated WebAuthn challenge stays valid before it must be reissued. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Extract the challenge from a WebAuthn clientDataJSON (base64url), or null if unparseable. */
function parseClientChallenge(clientDataJSON: string): string | null {
  try {
    const json = Buffer.from(clientDataJSON, 'base64url').toString('utf8');
    const clientData = JSON.parse(json) as { challenge?: unknown };
    return typeof clientData.challenge === 'string' ? clientData.challenge : null;
  } catch {
    return null;
  }
}

@Injectable()
export class PasskeyService {
  private readonly rpName: string;
  private readonly rpId: string;
  private readonly origin: string;

  /**
   * Server-issued challenges, keyed by user id (username flow) or by the challenge value itself
   * (usernameless flow, where no user is known when options are generated). The expected challenge
   * is always taken from here — never from client-supplied data — which keeps freshness and replay
   * protection intact. In-memory, so challenges are not shared across multiple server instances.
   */
  private readonly challenges = new Map<string, StoredChallenge>();

  constructor(private readonly prisma: PrismaService) {
    this.rpName = process.env['WEBAUTHN_RP_NAME'] ?? 'Bunker46';
    this.rpId = process.env['WEBAUTHN_RP_ID'] ?? 'localhost';
    this.origin = process.env['WEBAUTHN_ORIGIN'] ?? 'http://localhost:5173';
  }

  private storeChallenge(key: string, challenge: string): void {
    this.pruneExpiredChallenges();
    this.challenges.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  }

  /**
   * Atomically take a stored, unexpired challenge (returns it and removes it), or null. Consuming on
   * read — before the async verification — gives strict one-time-use semantics: a challenge cannot be
   * replayed even by two concurrent requests, and a failed verification does not leave it reusable
   * within the TTL window. The removal is synchronous (no await between get and delete), so there is
   * no time-of-check/time-of-use gap on Node's single-threaded loop.
   */
  private consumeChallenge(key: string): string | null {
    const entry = this.challenges.get(key);
    if (!entry) return null;
    this.challenges.delete(key);
    if (entry.expiresAt < Date.now()) return null;
    return entry.challenge;
  }

  private pruneExpiredChallenges(): void {
    const now = Date.now();
    for (const [key, entry] of this.challenges) {
      if (entry.expiresAt < now) this.challenges.delete(key);
    }
  }

  async generateRegistrationOptions(userId: string, username: string) {
    const existingPasskeys = await this.prisma.passkey.findMany({
      where: { userId },
    });

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userID: new TextEncoder().encode(userId),
      userName: username,
      attestationType: 'none',
      excludeCredentials: existingPasskeys.map((p) => ({
        id: p.credentialId,
        transports: p.transports as any[],
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });

    this.storeChallenge(userId, options.challenge);
    return options;
  }

  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
  ): Promise<Awaited<ReturnType<typeof verifyRegistrationResponse>>> {
    const expectedChallenge = this.consumeChallenge(userId);
    if (!expectedChallenge) throw new Error('No challenge found');

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Registration verification failed');
    }

    const { credential } = verification.registrationInfo;

    await this.prisma.passkey.create({
      data: {
        userId,
        credentialId: credential.id,
        credentialPublicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: (response.response.transports as string[]) ?? [],
      },
    });

    return verification;
  }

  async generateAuthenticationOptions(username?: string) {
    if (username) {
      const user = await this.prisma.user.findUnique({
        where: { username },
        include: { passkeys: true },
      });
      if (!user) throw new Error('User not found');

      const options = await generateAuthenticationOptions({
        rpID: this.rpId,
        allowCredentials: user.passkeys.map((p) => ({
          id: p.credentialId,
          transports: p.transports as any[],
        })),
        userVerification: 'preferred',
      });

      this.storeChallenge(user.id, options.challenge);
      return { options, userId: user.id };
    }

    // Usernameless: no allowCredentials so the browser shows discoverable passkeys. No user is known
    // yet, so the challenge is keyed by its own value; verifyAuthentication only accepts a challenge
    // found in this store (issued by us, unexpired), never the raw value from the client response.
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: [],
      userVerification: 'preferred',
    });
    this.storeChallenge(options.challenge, options.challenge);
    return { options, userId: undefined };
  }

  /**
   * Verify passkey authentication. If userId is omitted (usernameless flow),
   * the user is resolved from the credential id in the response.
   */
  async verifyAuthentication(
    response: AuthenticationResponseJSON,
    userId?: string,
  ): Promise<{
    verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    userId: string;
  }> {
    const passkey = await this.prisma.passkey.findUnique({
      where: { credentialId: response.id },
    });
    if (!passkey) throw new Error('Passkey not found');
    const resolvedUserId = userId ?? passkey.userId;
    if (passkey.userId !== resolvedUserId) throw new Error('Passkey not found');

    // The expected challenge always comes from trusted server state. For the username flow it is
    // keyed by user id; for the usernameless flow we use the challenge echoed in the client response
    // only as a lookup key, and reject unless that exact challenge is one we issued and stored.
    const challengeKey =
      userId !== undefined ? userId : parseClientChallenge(response.response.clientDataJSON);
    if (!challengeKey) throw new Error('No challenge found');
    const expectedChallenge = this.consumeChallenge(challengeKey);
    if (!expectedChallenge) throw new Error('No challenge found');

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.credentialPublicKey,
        counter: Number(passkey.counter),
        transports: passkey.transports as any[],
      },
    });

    if (verification.verified) {
      await this.prisma.passkey.update({
        where: { id: passkey.id },
        data: { counter: BigInt(verification.authenticationInfo.newCounter) },
      });
    }

    return { verification, userId: passkey.userId };
  }

  async listPasskeys(userId: string) {
    const passkeys = await this.prisma.passkey.findMany({
      where: { userId },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return passkeys;
  }

  async deletePasskey(userId: string, passkeyId: string) {
    const passkey = await this.prisma.passkey.findUnique({ where: { id: passkeyId } });
    if (!passkey) throw new NotFoundException('Passkey not found');
    if (passkey.userId !== userId) throw new ForbiddenException('Not your passkey');
    await this.prisma.passkey.delete({ where: { id: passkeyId } });
  }
}
