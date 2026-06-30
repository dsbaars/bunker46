import { describe, it, expect, vi } from 'vitest';
import { isTransientRelayError, createFatalHandler } from './process-guards.js';

describe('process-guards', () => {
  describe('isTransientRelayError', () => {
    it('matches nostr-tools SendingOnClosedConnection by name', () => {
      const err = new Error('Tried to send on a closed connection to wss://relay.example/');
      err.name = 'SendingOnClosedConnection';
      expect(isTransientRelayError(err)).toBe(true);
    });

    it('rejects unrelated errors and non-Error values', () => {
      expect(isTransientRelayError(new Error('real bug'))).toBe(false);
      expect(isTransientRelayError('SendingOnClosedConnection')).toBe(false);
      expect(isTransientRelayError(null)).toBe(false);
      expect(isTransientRelayError(undefined)).toBe(false);
      expect(isTransientRelayError({ name: 'SendingOnClosedConnection' })).toBe(false);
    });
  });

  describe('createFatalHandler', () => {
    function setup() {
      const logger = { warn: vi.fn(), error: vi.fn() };
      const exit = vi.fn();
      return { logger, exit, handle: createFatalHandler(logger, exit) };
    }

    it('swallows transient relay errors without exiting', () => {
      const { logger, exit, handle } = setup();
      const err = new Error('closed');
      err.name = 'SendingOnClosedConnection';
      handle('exception', err);
      expect(exit).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('exits(1) on any other uncaught error so the restart policy takes over', () => {
      const { logger, exit, handle } = setup();
      handle('exception', new Error('genuine crash'));
      expect(exit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledOnce();
    });

    it('exits(1) on a non-transient unhandled rejection', () => {
      const { exit, handle } = setup();
      handle('rejection', 'some string reason');
      expect(exit).toHaveBeenCalledWith(1);
    });
  });
});
