import { describe, expect, it } from 'vitest';
import { describeConnectionFailure, hepsiburadaFieldLabel } from './connection-failure';

describe('describeConnectionFailure', () => {
  it.each([
    ['trendyol', 'Trendyol API 403 on /product/sellers/123456/products/approved?page=0&size=1', /Trendyol bilgileri kabul etmedi \(HTTP 403\)/],
    ['trendyol', 'Trendyol API 401 on /x', /kabul etmedi \(HTTP 401\)/],
    ['hepsiburada', 'Hepsiburada API 401 on /listings/merchantid/abc?offset=0&limit=1', /Hepsiburada bilgileri kabul etmedi \(HTTP 401\)/],
    ['trendyol', 'Trendyol API 404 on /x', /bulunamadı \(HTTP 404\)/],
    ['trendyol', 'Trendyol API 429 on /x', /Çok fazla istek \(HTTP 429\)/],
    ['hepsiburada', 'Hepsiburada API 503 on /x', /şu anda yanıt vermiyor \(HTTP 503\)/],
    ['trendyol', 'fetch failed', /Trendyol'a bağlanılamadı/],
    ['hepsiburada', 'getaddrinfo ENOTFOUND mpop-sit.hepsiburada.com', /Hepsiburada'ya bağlanılamadı/],
    ['trendyol', 'The operation was aborted due to timeout', /bağlanılamadı/],
  ] as const)('%s: %s', (code, raw, expected) => {
    const text = describeConnectionFailure(code, raw);
    expect(text).toMatch(expected);
    expect(text).not.toMatch(/ on \//);
  });

  it('names the fields to check for a refused login', () => {
    expect(describeConnectionFailure('trendyol', 'Trendyol API 403 on /x')).toMatch(/API Anahtarı.*Satıcı Kimliği/);
    expect(describeConnectionFailure('hepsiburada', 'Hepsiburada API 401 on /x')).toMatch(/Mağaza Kullanıcı Adı.*Merchant ID/);
  });

  it('passes an unrecognised message through unchanged', () => {
    expect(describeConnectionFailure('trendyol', 'Satıcı bulunamadı')).toBe('Satıcı bulunamadı');
  });
});

describe('hepsiburadaFieldLabel', () => {
  it('uses the labels on the form', () => {
    expect(hepsiburadaFieldLabel('merchantId')).toBe('Merchant ID');
    expect(hepsiburadaFieldLabel('username')).toBe('Mağaza Kullanıcı Adı');
    expect(hepsiburadaFieldLabel('password')).toBe('Şifre');
    expect(hepsiburadaFieldLabel('other')).toBe('other');
  });
});
