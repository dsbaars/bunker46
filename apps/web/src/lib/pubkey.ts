/**
 * Encode a 64-char hex public key to NIP-19 npub (bech32).
 */
export async function hexToNpub(hex: string): Promise<string> {
  const { nip19 } = await import('nostr-tools');
  return nip19.npubEncode(hex);
}
