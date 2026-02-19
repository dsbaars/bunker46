import { describe, it, expect } from 'vitest';
import { BunkerUriService } from './bunker-uri.service.js';

describe('BunkerUriService', () => {
  const service = new BunkerUriService();
  const testPubkey = 'fa984bd7dbb282f07e16e7ae87b26a2a7b9b90b7246a44771f0cf5ae58018f52';

  describe('parseBunkerUri', () => {
    it('should parse a valid bunker:// URI', () => {
      const uri = `bunker://${testPubkey}?relay=wss%3A%2F%2Frelay.example.com&secret=mysecret`;
      const result = service.parseBunkerUri(uri);
      expect(result).toEqual({
        pubkey: testPubkey,
        relays: ['wss://relay.example.com'],
        secret: 'mysecret',
      });
    });

    it('should return null for invalid URIs', () => {
      expect(service.parseBunkerUri('invalid')).toBeNull();
      expect(service.parseBunkerUri('bunker://tooshort')).toBeNull();
    });
  });

  describe('parseNostrConnectUri', () => {
    it('should parse a valid nostrconnect:// URI', () => {
      const uri = `nostrconnect://${testPubkey}?relay=wss%3A%2F%2Frelay.example.com&secret=abc&name=TestApp`;
      const result = service.parseNostrConnectUri(uri);
      expect(result?.clientPubkey).toBe(testPubkey);
      expect(result?.secret).toBe('abc');
      expect(result?.name).toBe('TestApp');
    });
  });

  describe('buildBunkerUri', () => {
    it('should build a valid bunker:// URI', () => {
      const uri = service.buildBunkerUri(testPubkey, ['wss://relay.example.com'], 'sec');
      expect(uri).toContain('bunker://');
      expect(uri).toContain(testPubkey);
      expect(uri).toContain('relay.example.com');
    });
  });
});
