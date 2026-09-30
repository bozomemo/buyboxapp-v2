import { createLogger } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import { DevConsoleSmsSender, DisabledSmsSender, SmsConfigurationError, createSmsSender } from './senders.js';

const lines: string[] = [];
const logger = createLogger({ name: 'test', sinks: { out: (line) => lines.push(line), err: (line) => lines.push(line) } });

describe('createSmsSender (doc 18 §5.3)', () => {
  const cases: readonly { name: string; env: NodeJS.ProcessEnv; expected: string | typeof SmsConfigurationError }[] = [
    { name: 'unset → disabled', env: {}, expected: 'disabled' },
    { name: 'empty → disabled', env: { SMS_PROVIDER: ' ' }, expected: 'disabled' },
    { name: 'explicitly disabled', env: { SMS_PROVIDER: 'disabled' }, expected: 'disabled' },
    { name: 'dev-console in development', env: { SMS_PROVIDER: 'dev-console', NODE_ENV: 'development' }, expected: 'dev-console' },
    { name: 'dev-console in production is refused', env: { SMS_PROVIDER: 'dev-console', NODE_ENV: 'production' }, expected: SmsConfigurationError },
    { name: 'an unknown provider is refused, not ignored', env: { SMS_PROVIDER: 'netgsm' }, expected: SmsConfigurationError },
  ];
  it.each(cases)('$name', ({ env, expected }) => {
    if (typeof expected === 'string') expect(createSmsSender(env, logger).name).toBe(expected);
    else expect(() => createSmsSender(env, logger)).toThrow(expected);
  });
});

describe('the senders', () => {
  it('the disabled sender is unavailable and sends nothing', async () => {
    const sender = new DisabledSmsSender();
    expect(sender.available).toBe(false);
    expect(await sender.send('+905321234567', 'x')).toEqual({ ok: false, error: { kind: 'unavailable', detail: expect.any(String) } });
  });

  it('the console sender logs the message for a developer', async () => {
    lines.length = 0;
    const result = await new DevConsoleSmsSender(logger).send('+905321234567', 'BuyBox doğrulama kodunuz: 123456.');
    expect(result).toEqual({ ok: true, value: { providerRef: null } });
    expect(lines.join('\n')).toContain('123456');
  });
});
