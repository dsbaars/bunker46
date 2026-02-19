import { Injectable } from '@nestjs/common';
import type { BunkerPointer, NostrConnectParams } from '@bunker46/shared-types';

@Injectable()
export class BunkerUriService {
  parseBunkerUri(uri: string): BunkerPointer | null {
    try {
      if (!uri.startsWith('bunker://')) return null;
      const url = new URL(uri);
      const pubkey = url.hostname || url.pathname.replace('//', '');
      const relays = url.searchParams.getAll('relay');
      const secret = url.searchParams.get('secret') ?? undefined;

      if (!/^[0-9a-f]{64}$/.test(pubkey)) return null;
      return { pubkey, relays, secret };
    } catch {
      return null;
    }
  }

  parseNostrConnectUri(uri: string): NostrConnectParams | null {
    try {
      if (!uri.startsWith('nostrconnect://')) return null;
      const url = new URL(uri);
      const clientPubkey = url.hostname || url.pathname.replace('//', '');
      const relays = url.searchParams.getAll('relay');
      const secret = url.searchParams.get('secret') ?? '';
      const perms = url.searchParams.get('perms') ?? undefined;
      const name = url.searchParams.get('name') ?? undefined;
      const appUrl = url.searchParams.get('url') ?? undefined;
      const image = url.searchParams.get('image') ?? undefined;

      if (!/^[0-9a-f]{64}$/.test(clientPubkey)) return null;
      return { clientPubkey, relays, secret, perms, name, url: appUrl, image };
    } catch {
      return null;
    }
  }

  buildBunkerUri(signerPubkey: string, relays: string[], secret?: string): string {
    const params = new URLSearchParams();
    for (const r of relays) params.append('relay', r);
    if (secret) params.set('secret', secret);
    return `bunker://${signerPubkey}?${params.toString()}`;
  }

  buildNostrConnectUri(params: NostrConnectParams): string {
    const searchParams = new URLSearchParams();
    for (const r of params.relays) searchParams.append('relay', r);
    searchParams.set('secret', params.secret);
    if (params.perms) searchParams.set('perms', params.perms);
    if (params.name) searchParams.set('name', params.name);
    if (params.url) searchParams.set('url', params.url);
    if (params.image) searchParams.set('image', params.image);
    return `nostrconnect://${params.clientPubkey}?${searchParams.toString()}`;
  }
}
