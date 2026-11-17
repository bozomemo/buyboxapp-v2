import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { LoginClient } from './login-client';
import { MfaChallengeClient } from './mfa/mfa-challenge-client';

/**
 * doc 19 §9: the guide is behind sign-in, so the two sign-in screens themselves tell a locked-out
 * user what to do. The text is fixed by the spec, verbatim.
 */
const NOTE =
  'Şifrenizi veya doğrulama kodunuzu kaybettiyseniz yöneticinize başvurun; yönetici Kullanıcılar ekranından sıfırlayabilir.';

afterEach(() => cleanup());

function noteOnScreen() {
  const el = screen.getByTestId('lost-access-note');
  expect(el.textContent).toBe(NOTE);
  expect(el.querySelector('strong')?.textContent).toBe('Kullanıcılar');
}

describe('lost-access note', () => {
  it('is on the login screen', () => {
    stubFetch({ '/api/bootstrap': { body: { bootstrapMode: false } } });
    render(<LoginClient next="/" />);
    noteOnScreen();
  });

  it('is on the second-factor screen', async () => {
    stubFetch({
      '/api/auth/mfa': {
        body: { methods: ['totp', 'recovery'], phoneHint: null, canRememberDevice: false, rememberDays: 30 },
      },
    });
    render(<MfaChallengeClient next="/" />);
    await screen.findByText('Doğrulama uygulamanızdaki 6 haneli kodu girin.');
    noteOnScreen();
  });

  it('is on the expired second-factor screen', async () => {
    stubFetch({ '/api/auth/mfa': { status: 401, body: { code: 'challenge_expired' } } });
    render(<MfaChallengeClient next="/" />);
    await screen.findByText('Doğrulama süresi doldu');
    noteOnScreen();
  });
});
