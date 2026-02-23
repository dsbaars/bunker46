import {
  generateMnemonic as scureGenerateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';

/** Nostr's coin type on SLIP-44 */
const NOSTR_COIN_TYPE = 1237;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Derive a Nostr private key from a BIP-39 mnemonic using NIP-06.
 * Path: m/44'/1237'/<account>'/0/0
 *
 * @param mnemonic    BIP-39 mnemonic phrase
 * @param account     Account index (default 0)
 * @param passphrase  Optional BIP-39 passphrase (default empty)
 * @returns { nsecHex, publicKey } ready for POST /connections/nsec-keys
 */
export async function deriveNip06Key(
  mnemonic: string,
  account = 0,
  passphrase = '',
): Promise<{ nsecHex: string; publicKey: string }> {
  const normalised = mnemonic.trim().replace(/\s+/g, ' ');

  if (!validateMnemonic(normalised, english)) {
    throw new Error('Invalid mnemonic. Please enter a valid BIP-39 seed phrase.');
  }

  const seed = mnemonicToSeedSync(normalised, passphrase);
  const root = HDKey.fromMasterSeed(seed);
  const path = `m/44'/${NOSTR_COIN_TYPE}'/${account}'/0/0`;
  const child = root.derive(path);

  if (!child.privateKey) {
    throw new Error('Failed to derive private key.');
  }

  const nsecHex = toHex(child.privateKey);
  const { getPublicKey } = await import('nostr-tools/pure');
  const publicKey = getPublicKey(child.privateKey);

  return { nsecHex, publicKey };
}

/** Generate a fresh random 24-word BIP-39 mnemonic. */
export function generateMnemonic(): string {
  return scureGenerateMnemonic(english, 256);
}
