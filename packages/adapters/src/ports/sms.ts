/**
 * The SMS port (docs/18-authentication-and-access.md §5.3, docs/17-brand-product-management.md
 * §6.1). One port for both uses — the second factor and the notification digest — so the
 * provider adapter, written when the product owner chooses a provider (Netgsm, İleti Merkezi,
 * Verimor…), is written once.
 *
 * A send either returns the provider's own message reference or a failure the caller records.
 * It never throws for a provider refusal: an SMS that did not go is an expected outcome, not an
 * exceptional one.
 */
import type { Result } from '@buybox/shared';

export type SmsFailureKind =
  /** No provider configured — SMS is off, and callers hide it rather than offer it. */
  | 'unavailable'
  /** The provider refused this number (invalid, blocked, not a mobile). */
  | 'rejected'
  /** The provider could not be reached or answered with an error. */
  | 'provider_error';

export interface SmsFailure {
  readonly kind: SmsFailureKind;
  /** For the log and the sign-in log; never shown to an anonymous caller. */
  readonly detail: string;
}

export interface SmsSender {
  /** `disabled`, `dev-console`, or the provider's name. */
  readonly name: string;
  /** False only for the disabled sender. What decides whether SMS is offered at all. */
  readonly available: boolean;
  /** `to` is E.164 (`+905…`); `text` is sent as written. */
  send(to: string, text: string): Promise<Result<{ readonly providerRef: string | null }, SmsFailure>>;
}
