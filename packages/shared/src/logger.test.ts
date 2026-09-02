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
  it('expands Error values instead of writing the empty object JSON.stringify produces', () => {
    const errLines: string[] = [];
    const logger = createLogger({ name: 'test', sinks: { out: () => {}, err: (l) => errLines.push(l) } });

    const cause = new Error('socket hang up');
    logger.error('adapter.failed', { error: new Error('submit failed', { cause }) });

    const record = JSON.parse(errLines[0]!);
    expect(record.error.name).toBe('Error');
    expect(record.error.message).toBe('submit failed');
    expect(record.error.stack).toContain('submit failed');
    expect(record.error.cause.message).toBe('socket hang up');
  });

  it('keeps fields an adapter attached to its error', () => {
    const errLines: string[] = [];
    const logger = createLogger({ name: 'test', sinks: { out: () => {}, err: (l) => errLines.push(l) } });

    const error = Object.assign(new Error('rejected'), { status: 429, marketplaceCode: 'TY' });
    logger.error('adapter.failed', { error });

    const record = JSON.parse(errLines[0]!);
    expect(record.error.status).toBe(429);
    expect(record.error.marketplaceCode).toBe('TY');
  });

  it('writes bigint money as a string rather than throwing', () => {
    const outLines: string[] = [];
    const logger = createLogger({ name: 'test', sinks: { out: (l) => outLines.push(l), err: () => {} } });

    expect(() => logger.info('price.decided', { finalPrice: 129900n })).not.toThrow();
    expect(JSON.parse(outLines[0]!).finalPrice).toBe('129900');
  });

  it('redacts fields whose name says credential, at any depth', () => {
    const outLines: string[] = [];
    const logger = createLogger({ name: 'test', sinks: { out: (l) => outLines.push(l), err: () => {} } });

    logger.info('request.sent', {
      apiKey: 'k-live-123',
      request: { headers: { Authorization: 'Basic abc', 'x-correlation-id': 'run-1' } },
      accounts: [{ apiSecret: 's-live', supplierId: 42 }],
      // A sensitive *container* name redacts the whole value, nested keys and all.
      credentials: { supplierId: 42 },
      password: 'hunter2',
      supplierId: 42,
    });

    const record = JSON.parse(outLines[0]!);
    expect(record.apiKey).toBe('[redacted]');
    expect(record.request.headers.Authorization).toBe('[redacted]');
    expect(record.request.headers['x-correlation-id']).toBe('run-1');
    expect(record.accounts[0].apiSecret).toBe('[redacted]');
    expect(record.accounts[0].supplierId).toBe(42);
    expect(record.credentials).toBe('[redacted]');
    expect(record.password).toBe('[redacted]');
    expect(record.supplierId).toBe(42);
    expect(outLines[0]).not.toContain('hunter2');
    expect(outLines[0]).not.toContain('k-live-123');
  });

  it('survives a circular structure rather than throwing inside the log call', () => {
    const outLines: string[] = [];
    const logger = createLogger({ name: 'test', sinks: { out: (l) => outLines.push(l), err: () => {} } });

    const node: Record<string, unknown> = { id: 'a' };
    node.self = node;

    expect(() => logger.info('graph', { node })).not.toThrow();
    expect(JSON.parse(outLines[0]!).node.self).toBe('[circular]');
  });
});
