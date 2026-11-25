import { describe, expect, it } from 'vitest';
import { formatIdentityAddress } from './identity-address';

// Review 2026-11-25: the identity panel printed the address as the marketplace sends it,
// "Mahalle/Semt:MERKEZ MAH. Cadde/Sokak:…", labels and all.
describe('formatIdentityAddress', () => {
  it('drops the field labels and joins the parts with commas', () => {
    expect(
      formatIdentityAddress('Mahalle/Semt:MERKEZ MAH. Cadde/Sokak:ATATÜRK CAD. Kapı No:12 İlçe:ÇANKAYA'),
    ).toBe('MERKEZ MAH., ATATÜRK CAD., Kapı No 12, ÇANKAYA');
  });

  it('leaves an address without labels as it is', () => {
    expect(formatIdentityAddress('Moda Cd. No:1 Kadıköy')).toBe('Moda Cd. No:1 Kadıköy');
  });

  it('keeps null as null', () => {
    expect(formatIdentityAddress(null)).toBeNull();
  });
});
