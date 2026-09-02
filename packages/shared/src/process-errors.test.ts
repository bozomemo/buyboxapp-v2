import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger.js';
import { registerProcessErrorHandlers, resetProcessErrorHandlersForTest } from './process-errors.js';

/**
 * The handlers are registered on the real `process`, so every case tears them down again — a
 * leaked listener would swallow a later test's rejection and make the suite lie.
 */
afterEach(() => {
  resetProcessErrorHandlersForTest();
});

function capture() {
  const lines: string[] = [];
  return {
    lines,
    logger: createLogger({ name: 'test', sinks: { out: (l) => lines.push(l), err: (l) => lines.push(l) } }),
  };
}

describe('registerProcessErrorHandlers', () => {
  it('logs an uncaught exception with its stack and exits so the service restarts', async () => {
    const { lines, logger } = capture();
    const exit = vi.fn();
    registerProcessErrorHandlers({ logger, exit, flushMs: 0 });

    process.emit('uncaughtException', new Error('boom'));
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

    const record = JSON.parse(lines[0]!);
    expect(record.message).toBe('process.uncaughtException');
    expect(record.level).toBe('error');
    expect(record.fatal).toBe(true);
    expect(record.error.message).toBe('boom');
    expect(record.error.stack).toContain('boom');
  });

  it('logs an unhandled rejection but keeps the process running', async () => {
    const { lines, logger } = capture();
    const exit = vi.fn();
    registerProcessErrorHandlers({ logger, exit, flushMs: 0 });

    process.emit('unhandledRejection', new Error('nobody awaited me'), Promise.resolve());
    await vi.waitFor(() => expect(lines).toHaveLength(1));

    const record = JSON.parse(lines[0]!);
    expect(record.message).toBe('process.unhandledRejection');
    expect(record.fatal).toBe(false);
    expect(exit).not.toHaveBeenCalled();
  });

  it('persists the fault through onFatal before exiting', async () => {
    const { logger } = capture();
    const exit = vi.fn();
    const onFatal = vi.fn().mockResolvedValue(undefined);
    registerProcessErrorHandlers({ logger, exit, onFatal, flushMs: 0 });

    process.emit('uncaughtException', new Error('boom'));
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(onFatal).toHaveBeenCalledTimes(1);
    const event = onFatal.mock.calls[0]![0] as { kind: string; message: string };
    expect(event.kind).toBe('uncaughtException');
    expect(event.message).toBe('boom');
  });

  it('still exits when the onFatal sink is the thing that is broken', async () => {
    const { lines, logger } = capture();
    const exit = vi.fn();
    registerProcessErrorHandlers({
      logger,
      exit,
      flushMs: 0,
      onFatal: () => Promise.reject(new Error('database is gone')),
    });

    process.emit('uncaughtException', new Error('boom'));
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

    // The original fault is still the first line; the sink's own failure never masks it.
    expect(JSON.parse(lines[0]!).message).toBe('process.uncaughtException');
    expect(JSON.parse(lines[1]!).message).toBe('process.fatalSinkFailed');
  });

  it('registers once, so a second call cannot double-log or race two exits', () => {
    const { logger } = capture();
    expect(registerProcessErrorHandlers({ logger, exit: () => {} })).toBe(true);
    expect(registerProcessErrorHandlers({ logger, exit: () => {} })).toBe(false);
    expect(process.listenerCount('uncaughtException')).toBe(1);
  });
});
