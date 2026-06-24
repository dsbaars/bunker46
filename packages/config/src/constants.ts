export const NOSTR_CONSTANTS = {
  NIP46_KIND: 24133,
  DEFAULT_RELAYS: [
    'wss://relay.nsec.app',
    'wss://relay.damus.io',
    'wss://nos.lol',
  ] as readonly string[],
  /**
   * How often (ms) the bunker watchdog checks relay connection status and
   * re-subscribes any listener whose relay(s) have dropped. Guards against
   * nostr-tools' built-in reconnect failing to recover from abrupt socket
   * errors (it gives up when an `error` fires before a clean `close`).
   */
  RELAY_WATCHDOG_INTERVAL_MS: 30_000,
} as const;
