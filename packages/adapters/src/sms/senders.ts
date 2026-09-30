/**
 * The SMS adapters that exist before a provider is chosen (doc 18 §5.3):
 *
 * - `DisabledSmsSender` — `SMS_PROVIDER` unset, the state of every install today. Reports itself
 *   unavailable, so SMS is not offered anywhere.
 * - `DevConsoleSmsSender` — `SMS_PROVIDER=dev-console`, development only. Writes the message to
 *   the log so a developer can sign in with SMS. **Refused under `NODE_ENV=production`**: the
 *   message holds the code, and logs are shipped to Grafana (doc 16).
 *
 * The real provider adapter joins `createSmsSender` when the product owner picks one, and is
 * tested against recorded response fixtures like every adapter (CLAUDE.md).
 */
import { err, ok, type Logger } from '@buybox/shared';
import type { SmsSender } from '../ports/sms.js';

export class DisabledSmsSender implements SmsSender {
  readonly name = 'disabled';
  readonly available = false;
  async send() {
    return err({ kind: 'unavailable' as const, detail: 'SMS_PROVIDER is not set' });
  }
}

export class DevConsoleSmsSender implements SmsSender {
  readonly name = 'dev-console';
  readonly available = true;
  constructor(private readonly logger: Logger) {}
  async send(to: string, text: string) {
    // `sms`, not a key the logger would redact: seeing the code is this adapter's whole purpose,
    // and it cannot run where the log leaves the machine.
    this.logger.warn('sms.devConsole', { to, sms: text });
    return ok({ providerRef: null });
  }
}

export class SmsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmsConfigurationError';
  }
}

/**
 * Chooses the sender from the environment. Throws `SmsConfigurationError` for a value that must
 * stop the service from starting — an unknown provider, or the console sender in production —
 * rather than quietly running without SMS, or worse, with codes in the log.
 */
export function createSmsSender(env: NodeJS.ProcessEnv, logger: Logger): SmsSender {
  const provider = (env.SMS_PROVIDER ?? '').trim();
  if (provider === '' || provider === 'disabled') return new DisabledSmsSender();
  if (provider === 'dev-console') {
    if (env.NODE_ENV === 'production') {
      throw new SmsConfigurationError(
        'SMS_PROVIDER=dev-console is refused in production: it writes verification codes to the log, and the log leaves the machine (doc 16).',
      );
    }
    return new DevConsoleSmsSender(logger);
  }
  throw new SmsConfigurationError(
    `SMS_PROVIDER="${provider}" is not a known provider. Leave it unset until a provider adapter exists (doc 18 §5.3, doc 17 §7).`,
  );
}
