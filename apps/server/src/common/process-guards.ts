import { Logger } from '@nestjs/common';

const WS_CLOSED_BEFORE_ESTABLISHED = 'WebSocket was closed before the connection was established';

/**
 * nostr-tools' relay pool throws `SendingOnClosedConnection` asynchronously from a WebSocket
 * 'open' handler when a subscription re-fires on a socket that closed mid-reconnect. The throw
 * escapes our `try/catch` (it happens in the ws event loop, not our call stack) and surfaces as an
 * `uncaughtException`. In production a relay reconnect storm triggered this and killed the whole
 * bunker process, which — with no restart policy — then stayed down for days. These errors are
 * transient and safe to ignore: the connection watchdog re-subscribes the dropped relay shortly
 * after.
 *
 * The same applies to `ws`'s "WebSocket was closed before the connection was established": the
 * pool's connect timeout closes a socket that is still CONNECTING and `ws` raises this outside our
 * call stack. Treating it as fatal let a single unreachable or slow relay crash-loop the whole
 * bunker — and every restart also wiped the in-memory pending bunker:// connect secrets.
 */
export function isTransientRelayError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'SendingOnClosedConnection' || err.message === WS_CLOSED_BEFORE_ESTABLISHED;
}

type ExitFn = (code: number) => void;
type GuardLogger = Pick<Logger, 'warn' | 'error'>;

/**
 * Builds the handler shared by `uncaughtException` and `unhandledRejection`: transient relay errors
 * are logged and swallowed so a flaky relay can't take the process down; anything else is logged
 * and the process exits, so the container restart policy gives a clean restart rather than letting
 * the process limp on in an undefined state.
 */
export function createFatalHandler(logger: GuardLogger, exit: ExitFn) {
  return (label: string, err: unknown): void => {
    if (isTransientRelayError(err)) {
      logger.warn(`Ignoring transient relay ${label}: ${(err as Error).message}`);
      return;
    }
    logger.error(
      `Fatal ${label} — exiting for a clean restart`,
      err instanceof Error ? err.stack : String(err),
    );
    exit(1);
  };
}

export function installProcessGuards(
  logger: GuardLogger = new Logger('ProcessGuards'),
  exit: ExitFn = (code) => process.exit(code),
): void {
  const handle = createFatalHandler(logger, exit);
  process.on('uncaughtException', (err) => handle('exception', err));
  process.on('unhandledRejection', (reason) => handle('rejection', reason));
}
