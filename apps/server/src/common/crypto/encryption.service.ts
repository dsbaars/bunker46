import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from 'node:crypto';

/** Marker for the current ciphertext format. Pre-v2 ciphertext has no prefix (legacy SHA-256 key). */
const V2_PREFIX = 'v2:';

/**
 * scrypt cost parameters for passphrase-derived keys. Stable and documented: changing them changes
 * the derived key and would break decryption of v2 data. maxmem is raised to fit N=2^15.
 */
const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/**
 * Fixed application salt for the global-key KDF. A single global secret has exactly one target, so a
 * per-record salt buys little here; scrypt's cost factor is what raises offline-guessing cost. The
 * value provides domain separation and must remain stable to keep existing v2 data decryptable.
 */
const SCRYPT_SALT = Buffer.from('bunker46:encryption-key:v2');

/**
 * Decode ENCRYPTION_KEY as a raw 32-byte AES key when it is hex (64 chars) or canonical base64 /
 * base64url that decodes to exactly 32 bytes (e.g. `openssl rand -base64 32`). Returns null for
 * anything else, which is then treated as a passphrase. Round-trip checks reject lenient/partial
 * base64 so a normal passphrase is never mistaken for a raw key.
 *
 * Footgun, knowingly accepted: a passphrase that happens to be exactly 64 hex chars or canonical
 * 32-byte base64 (e.g. all "A"s) is taken as a raw key and used directly. Such values are extremely
 * unlikely for a human-chosen passphrase, are rejected as low-entropy by the production env check
 * (serverEnvSchema), and only affect NEW (v2) writes — legacy data still decrypts via legacyKey.
 */
function decodeRaw32(value: string): Buffer | null {
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  const b64 = Buffer.from(value, 'base64');
  if (b64.length === 32 && b64.toString('base64') === value) return b64;
  const b64url = Buffer.from(value, 'base64url');
  if (b64url.length === 32 && b64url.toString('base64url') === value) return b64url;
  return null;
}

/**
 * Derive the AES-256 key for the current (v2) format:
 * - a real 32-byte random key (hex/base64) is used directly — recommended, and fast; or
 * - any other secret is treated as a passphrase and stretched with scrypt, so a human-chosen key
 *   has meaningful resistance to offline guessing instead of a single SHA-256 pass.
 *
 * Derivation runs once at startup, so decrypt/encrypt on the signing hot path stay cheap regardless.
 */
function deriveKey(rawKey: string): Buffer {
  return decodeRaw32(rawKey) ?? scryptSync(rawKey, SCRYPT_SALT, 32, SCRYPT_PARAMS);
}

@Injectable()
export class EncryptionService {
  /** Key for the current (v2) format. */
  private readonly key: Buffer;
  /** Legacy key (plain SHA-256 of the raw secret); used only to decrypt pre-v2 ciphertext. */
  private readonly legacyKey: Buffer;

  constructor() {
    const rawKey = process.env['ENCRYPTION_KEY'];
    if (!rawKey || rawKey.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters');
    }
    this.legacyKey = createHash('sha256').update(rawKey).digest();
    this.key = deriveKey(rawKey);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return V2_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(ciphertext: string): string {
    const isV2 = ciphertext.startsWith(V2_PREFIX);
    const payload = isV2 ? ciphertext.slice(V2_PREFIX.length) : ciphertext;
    const key = isV2 ? this.key : this.legacyKey;
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }
}
