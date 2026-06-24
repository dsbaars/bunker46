import { z } from 'zod';

export const LoginRequestSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const TotpVerifySchema = z.object({
  code: z.string().length(6),
});
export type TotpVerify = z.infer<typeof TotpVerifySchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  /**
   * @deprecated The refresh token is delivered as an httpOnly cookie and is no longer returned in
   * the response body. This optional field is retained only for backward-compatible typing.
   */
  refreshToken: z.string().optional(),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export interface UserProfileDto {
  id: string;
  username: string;
  totpEnabled: boolean;
  passkeysCount: number;
  createdAt: string;
}

export interface UserSettingsDto {
  dateFormat: string;
  timeFormat: string;
}
