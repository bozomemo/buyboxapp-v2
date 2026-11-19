import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { PermissionFieldset, PermissionsProvider } from './permissions';

/**
 * doc 18 §7.2: "The UI hides controls the user lacks permission for." On 2026-11-19 an İzleyici
 * found the stock multiplier, "Ürün Ekle", "+ Yeni kural", the policy's "Kaydet" and a dozen
 * more enabled on screen; the server refused each with a bare "HTTP 403".
 */
afterEach(() => cleanup());

function signedInAs(permissions: string[]) {
  stubFetch({ '/api/auth/me': { body: { user: { permissions } } } });
}

function Form() {
  return (
    <PermissionsProvider>
      <PermissionFieldset permission="catalogue.manage">
        <input aria-label="Ad" />
        <button type="button">Kaydet</button>
      </PermissionFieldset>
      <button type="button">Ara</button>
    </PermissionsProvider>
  );
}

describe('PermissionFieldset', () => {
  it('disables every control inside it without the permission, and says why', async () => {
    signedInAs(['view']);
    render(<Form />);
    // `:disabled`, not `.disabled`: a control is disabled by its fieldset, not by its own attribute.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kaydet' }).matches(':disabled')).toBe(true));
    expect(screen.getByLabelText('Ad').matches(':disabled')).toBe(true);
    expect(screen.getByRole('group').getAttribute('title')).toBe('Bu işlem için yetkiniz yok');
    // A control outside the fieldset — a filter, a search — is untouched.
    expect(screen.getByRole('button', { name: 'Ara' }).matches(':disabled')).toBe(false);
  });

  it('leaves them enabled with the permission', async () => {
    signedInAs(['view', 'catalogue.manage']);
    render(<Form />);
    await screen.findByRole('button', { name: 'Kaydet' });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole('button', { name: 'Kaydet' }).matches(':disabled')).toBe(false);
    expect(screen.getByRole('group').getAttribute('title')).toBeNull();
  });
});
