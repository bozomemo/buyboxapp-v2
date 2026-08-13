import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';

describe('createLogger', () => {
  it('writes info/debug to the out sink and warn/error to the err sink, as structured JSON', () => {
    const outLines: string[] = [];
    const errLines: string[] = [];
    const logger = createLogger({
      name: 'test',
      sinks: { out: (l) => outLines.push(l), err: (l) => errLines.push(l) },
      now: () => '2026-01-01T00:00:00.000Z',
    });

    logger.debug('debugging');
    logger.info('hello', { foo: 'bar' });
    logger.warn('careful');
    logger.error('boom', { code: 500 });

    expect(outLines).toHaveLength(2);
    expect(errLines).toHaveLength(2);

    const info = JSON.parse(outLines[1]!);
    expect(info).toMatchObject({
      time: '2026-01-01T00:00:00.000Z',
      level: 'info',
      name: 'test',
      message: 'hello',
      foo: 'bar',
    });

    const error = JSON.parse(errLines[1]!);
    expect(error).toMatchObject({ level: 'error', message: 'boom', code: 500 });
  });

  it('child() carries fixed bindings (e.g. correlationId) onto every subsequent call', () => {
    const outLines: string[] = [];
    const logger = createLogger({
      name: 'test',
      sinks: { out: (l) => outLines.push(l), err: () => {} },
    });

    const child = logger.child({ correlationId: 'run-123' });
    child.info('step one');
    child.info('step two', { extra: true });

    const first = JSON.parse(outLines[0]!);
    const second = JSON.parse(outLines[1]!);
    expect(first.correlationId).toBe('run-123');
    expect(second.correlationId).toBe('run-123');
    expect(second.extra).toBe(true);
  });
});
