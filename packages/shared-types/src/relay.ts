import { z } from 'zod';

/**
 * Returns true if the hostname is a private IP, localhost, or metadata endpoint
 * (SSRF prevention for relay URLs).
 */
function isPrivateOrLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().trim();
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized === '0.0.0.0') return true;

  // IPv4
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / metadata)
    return false;
  }

  // IPv6 - check for localhost and unique-local
  if (normalized === '[::1]' || normalized === '::1') return true;
  if (normalized.startsWith('fe80:') || normalized.startsWith('[fe80:')) return true; // link-local
  if (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('[fc') ||
    normalized.startsWith('[fd')
  )
    return true; // unique local
  if (
    normalized.includes('::ffff:127.') ||
    normalized.includes('::ffff:10.') ||
    normalized.includes('::ffff:192.168.')
  )
    return true;

  return false;
}

/** Valid relay URL: must be wss:// and must not point to private/local/metadata hosts. */
export const SafeRelayUrlSchema = z
  .string()
  .url()
  .refine((url) => url.startsWith('wss://'), { message: 'Only wss:// relay URLs are allowed' })
  .refine(
    (url) => {
      try {
        const u = new URL(url);
        return !isPrivateOrLocalHost(u.hostname);
      } catch {
        return false;
      }
    },
    { message: 'Relay URL must not point to private, localhost, or metadata addresses' },
  );

/** Array of safe relay URLs for use in API request bodies. */
export const SafeRelayUrlsSchema = z.array(SafeRelayUrlSchema);

export type SafeRelayUrl = z.infer<typeof SafeRelayUrlSchema>;
export type SafeRelayUrls = z.infer<typeof SafeRelayUrlsSchema>;
