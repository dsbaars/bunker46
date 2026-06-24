import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { PasskeyService } from './passkey.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

const ISSUED_CHALLENGE = 'server-issued-challenge-abc';
const CRED_ID = 'cred-1';

function buildAuthResponse(challenge: string): AuthenticationResponseJSON {
  const clientData = { type: 'webauthn.get', challenge, origin: 'http://localhost:5173' };
  const clientDataJSON = Buffer.from(JSON.stringify(clientData)).toString('base64url');
  return {
    id: CRED_ID,
    rawId: CRED_ID,
    type: 'public-key',
    clientExtensionResults: {},
    response: { clientDataJSON, authenticatorData: 'aa', signature: 'bb' },
  } as unknown as AuthenticationResponseJSON;
}

describe('PasskeyService — usernameless challenge handling', () => {
  let service: PasskeyService;
  let prisma: {
    passkey: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    user: { findUnique: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prisma = {
      passkey: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'pk-1',
          userId: 'user-1',
          credentialId: CRED_ID,
          credentialPublicKey: Buffer.from('pub'),
          counter: BigInt(0),
          transports: [],
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          passkeys: [{ credentialId: CRED_ID, transports: [] }],
        }),
      },
    };
    service = new PasskeyService(prisma as unknown as PrismaService);

    vi.mocked(generateAuthenticationOptions).mockResolvedValue({
      challenge: ISSUED_CHALLENGE,
      allowCredentials: [],
    } as unknown as Awaited<ReturnType<typeof generateAuthenticationOptions>>);
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 5 },
    } as unknown as Awaited<ReturnType<typeof verifyAuthenticationResponse>>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('rejects a challenge the server never issued (no trust in client-supplied challenge)', async () => {
    const response = buildAuthResponse('forged-challenge-never-issued');
    await expect(service.verifyAuthentication(response)).rejects.toThrow('No challenge found');
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it('verifies against the stored challenge for an issued (usernameless) ceremony', async () => {
    await service.generateAuthenticationOptions(); // stores ISSUED_CHALLENGE
    const response = buildAuthResponse(ISSUED_CHALLENGE);

    const result = await service.verifyAuthentication(response);

    expect(result.userId).toBe('user-1');
    expect(verifyAuthenticationResponse).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(verifyAuthenticationResponse).mock.calls[0][0];
    expect(arg.expectedChallenge).toBe(ISSUED_CHALLENGE);
  });

  it('rejects replay: a consumed challenge cannot be used again', async () => {
    await service.generateAuthenticationOptions();
    const response = buildAuthResponse(ISSUED_CHALLENGE);

    await service.verifyAuthentication(response); // first use succeeds and consumes it
    await expect(service.verifyAuthentication(response)).rejects.toThrow('No challenge found');
  });

  it('rejects an expired challenge', async () => {
    vi.useFakeTimers();
    await service.generateAuthenticationOptions();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1); // past the 5 minute TTL
    const response = buildAuthResponse(ISSUED_CHALLENGE);
    await expect(service.verifyAuthentication(response)).rejects.toThrow('No challenge found');
  });

  describe('username flow (challenge keyed by userId)', () => {
    it('verifies against the stored challenge looked up by userId', async () => {
      await service.generateAuthenticationOptions('alice'); // stores challenge under user.id
      const response = buildAuthResponse(ISSUED_CHALLENGE);

      const result = await service.verifyAuthentication(response, 'user-1');

      expect(result.userId).toBe('user-1');
      expect(verifyAuthenticationResponse).toHaveBeenCalledTimes(1);
      expect(vi.mocked(verifyAuthenticationResponse).mock.calls[0][0].expectedChallenge).toBe(
        ISSUED_CHALLENGE,
      );
    });

    it('rejects replay of a consumed username-flow challenge', async () => {
      await service.generateAuthenticationOptions('alice');
      const response = buildAuthResponse(ISSUED_CHALLENGE);
      await service.verifyAuthentication(response, 'user-1');
      await expect(service.verifyAuthentication(response, 'user-1')).rejects.toThrow(
        'No challenge found',
      );
    });

    it('rejects a userId with no issued challenge (no verification attempted)', async () => {
      const response = buildAuthResponse(ISSUED_CHALLENGE);
      await expect(service.verifyAuthentication(response, 'user-1')).rejects.toThrow(
        'No challenge found',
      );
      expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
    });

    it('expires a username-flow challenge after the TTL', async () => {
      vi.useFakeTimers();
      await service.generateAuthenticationOptions('alice');
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      const response = buildAuthResponse(ISSUED_CHALLENGE);
      await expect(service.verifyAuthentication(response, 'user-1')).rejects.toThrow(
        'No challenge found',
      );
    });
  });
});
