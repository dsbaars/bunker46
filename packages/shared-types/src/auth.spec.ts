import { describe, it, expect } from 'vitest';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  TotpVerifySchema,
  AuthTokensSchema,
} from './auth.js';

describe('LoginRequestSchema', () => {
  it('should parse valid login request', () => {
    const result = LoginRequestSchema.safeParse({
      username: 'alice',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject short username', () => {
    expect(LoginRequestSchema.safeParse({ username: 'ab', password: 'password123' })).toMatchObject(
      { success: false },
    );
  });

  it('should reject short password', () => {
    expect(LoginRequestSchema.safeParse({ username: 'alice', password: 'short' })).toMatchObject({
      success: false,
    });
  });
});

describe('RegisterRequestSchema', () => {
  it('should parse valid register request', () => {
    const result = RegisterRequestSchema.safeParse({
      username: 'bob',
      password: 'securepass8',
    });
    expect(result.success).toBe(true);
  });

  it('should reject username over 64 chars', () => {
    expect(
      RegisterRequestSchema.safeParse({
        username: 'a'.repeat(65),
        password: 'password123',
      }),
    ).toMatchObject({ success: false });
  });
});

describe('TotpVerifySchema', () => {
  it('should parse 6-digit code', () => {
    expect(TotpVerifySchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('should reject non-6-digit code', () => {
    expect(TotpVerifySchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(TotpVerifySchema.safeParse({ code: '1234567' }).success).toBe(false);
  });
});

describe('AuthTokensSchema', () => {
  it('should parse tokens with accessToken', () => {
    const result = AuthTokensSchema.safeParse({ accessToken: 'jwt-here' });
    expect(result.success).toBe(true);
  });

  it('should accept optional refreshToken', () => {
    const result = AuthTokensSchema.safeParse({
      accessToken: 'a',
      refreshToken: 'r',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing accessToken', () => {
    expect(AuthTokensSchema.safeParse({})).toMatchObject({ success: false });
  });
});
