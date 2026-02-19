import { z } from 'zod';

export const LoginRequestSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  username: z.string().min(3).max(64),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const TotpVerifySchema = z.object({
  code: z.string().length(6),
});
export type TotpVerify = z.infer<typeof TotpVerifySchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export interface UserProfileDto {
  id: string;
  username: string;
  email?: string;
  totpEnabled: boolean;
  passkeysCount: number;
  createdAt: string;
}
