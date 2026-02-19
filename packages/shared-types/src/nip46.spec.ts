import { describe, it, expect } from 'vitest';
import {
  Nip46RequestSchema,
  Nip46ResponseSchema,
  BunkerPointerSchema,
  NostrConnectParamsSchema,
  ConnectionStatus,
} from './nip46.js';

const validPubkey = 'a'.repeat(64);

describe('Nip46RequestSchema', () => {
  it('should parse valid request', () => {
    const result = Nip46RequestSchema.safeParse({
      id: '1',
      method: 'ping',
      params: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe('ping');
    }
  });

  it('should accept all Nip46Method values', () => {
    const methods = [
      'connect',
      'sign_event',
      'ping',
      'get_public_key',
      'nip04_encrypt',
      'nip04_decrypt',
      'nip44_encrypt',
      'nip44_decrypt',
      'switch_relays',
    ] as const;
    for (const method of methods) {
      const result = Nip46RequestSchema.safeParse({ id: '1', method, params: [] });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid method', () => {
    const result = Nip46RequestSchema.safeParse({
      id: '1',
      method: 'invalid_method',
      params: [],
    });
    expect(result.success).toBe(false);
  });

  it('should require id, method, params', () => {
    expect(Nip46RequestSchema.safeParse({})).toMatchObject({ success: false });
    expect(Nip46RequestSchema.safeParse({ id: '1', method: 'ping' })).toMatchObject({
      success: false,
    });
  });
});

describe('Nip46ResponseSchema', () => {
  it('should parse response with result', () => {
    const result = Nip46ResponseSchema.safeParse({ id: '1', result: 'ok' });
    expect(result.success).toBe(true);
  });

  it('should parse response with error', () => {
    const result = Nip46ResponseSchema.safeParse({ id: '1', error: 'Failed' });
    expect(result.success).toBe(true);
  });

  it('should require id', () => {
    expect(Nip46ResponseSchema.safeParse({ result: 'ok' })).toMatchObject({ success: false });
  });
});

describe('BunkerPointerSchema', () => {
  it('should parse valid bunker pointer', () => {
    const result = BunkerPointerSchema.safeParse({
      pubkey: validPubkey,
      relays: ['wss://relay.example.com'],
      secret: 'optional',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid pubkey length', () => {
    expect(
      BunkerPointerSchema.safeParse({
        pubkey: 'short',
        relays: ['wss://r.example.com'],
      }),
    ).toMatchObject({ success: false });
  });

  it('should reject non-hex pubkey', () => {
    expect(
      BunkerPointerSchema.safeParse({
        pubkey: 'z'.repeat(64),
        relays: ['wss://r.example.com'],
      }),
    ).toMatchObject({ success: false });
  });

  it('should reject invalid relay URL', () => {
    expect(
      BunkerPointerSchema.safeParse({
        pubkey: validPubkey,
        relays: ['not-a-url'],
      }),
    ).toMatchObject({ success: false });
  });
});

describe('NostrConnectParamsSchema', () => {
  it('should parse valid params', () => {
    const result = NostrConnectParamsSchema.safeParse({
      clientPubkey: validPubkey,
      relays: ['wss://relay.example.com'],
      secret: 'sec',
      name: 'App',
    });
    expect(result.success).toBe(true);
  });

  it('should require secret', () => {
    expect(
      NostrConnectParamsSchema.safeParse({
        clientPubkey: validPubkey,
        relays: [],
      }),
    ).toMatchObject({ success: false });
  });
});

describe('ConnectionStatus', () => {
  it('should accept enum values', () => {
    expect(ConnectionStatus.safeParse('active').success).toBe(true);
    expect(ConnectionStatus.safeParse('pending').success).toBe(true);
    expect(ConnectionStatus.safeParse('revoked').success).toBe(true);
    expect(ConnectionStatus.safeParse('expired').success).toBe(true);
  });

  it('should reject invalid status', () => {
    expect(ConnectionStatus.safeParse('unknown').success).toBe(false);
  });
});
