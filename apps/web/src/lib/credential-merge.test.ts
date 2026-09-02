import { describe, expect, it } from 'vitest';
import { mergeCredentials, missingTrendyolCredentials } from './credential-merge';

const STORED = {
  apiKey: 'stored-key',
  apiSecret: 'stored-secret',
  sellerId: '722974',
  environment: 'production',
};

describe('mergeCredentials', () => {
  const cases: {
    name: string;
    stored: Record<string, string>;
    posted: Record<string, string> | undefined;
    expected: Record<string, string>;
  }[] = [
    {
      // The case that broke: an untouched form on a configured install. Before the fix this
      // produced `sellerId: ''` and a 404 on /product/sellers//products/approved.
      name: 'an untouched form tests what is stored',
      stored: STORED,
      posted: {},
      expected: STORED,
    },
    {
      name: 'an untouched form with no credentials posted at all',
      stored: STORED,
      posted: undefined,
      expected: STORED,
    },
    {
      name: 'a typed field wins over the stored one',
      stored: STORED,
      posted: { apiKey: 'typed-key' },
      expected: { ...STORED, apiKey: 'typed-key' },
    },
    {
      // Leaving the password blank while only switching environment must not blank the password.
      name: 'a blank field keeps the stored value rather than clearing it',
      stored: STORED,
      posted: { apiKey: '', apiSecret: '', environment: 'stage' },
      expected: { ...STORED, environment: 'stage' },
    },
    {
      name: 'the setup wizard, with nothing stored yet, tests exactly what was typed',
      stored: {},
      posted: { apiKey: 'k', apiSecret: 's', sellerId: '1' },
      expected: { apiKey: 'k', apiSecret: 's', sellerId: '1' },
    },
    {
      name: 'a field the store does not know about is carried through',
      stored: STORED,
      posted: { userAgentSuffix: 'SelfIntegration' },
      expected: { ...STORED, userAgentSuffix: 'SelfIntegration' },
    },
  ];

  for (const { name, stored, posted, expected } of cases) {
    it(name, () => {
      expect(mergeCredentials(stored, posted)).toEqual(expected);
    });
  }

  it('does not mutate either input', () => {
    const stored = { ...STORED };
    const posted = { apiKey: 'typed-key' };
    mergeCredentials(stored, posted);
    expect(stored).toEqual(STORED);
    expect(posted).toEqual({ apiKey: 'typed-key' });
  });
});

describe('missingTrendyolCredentials', () => {
  it('names nothing when the merged set is complete', () => {
    expect(missingTrendyolCredentials(STORED)).toEqual([]);
  });

  it('names every empty field by its on-screen label', () => {
    expect(missingTrendyolCredentials({})).toEqual([
      'API Anahtarı',
      'API Gizli Anahtarı',
      'Satıcı Kimliği (sellerId)',
    ]);
  });

  it('treats an empty string as missing, not as a value', () => {
    expect(missingTrendyolCredentials({ ...STORED, sellerId: '' })).toEqual([
      'Satıcı Kimliği (sellerId)',
    ]);
  });

  it('ignores the optional user-agent suffix', () => {
    expect(missingTrendyolCredentials({ ...STORED, userAgentSuffix: '' })).toEqual([]);
  });
});
