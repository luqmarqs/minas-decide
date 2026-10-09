import { describe, expect, it } from 'vitest';
import { maskEmail, maskPhone, normalizeBrazilPhone } from './phone.ts';

describe('normalizeBrazilPhone', () => {
  it('normalizes common formats to E.164', () => {
    expect(normalizeBrazilPhone('(31) 99999-8888')).toBe('+5531999998888');
    expect(normalizeBrazilPhone('31999998888')).toBe('+5531999998888');
    expect(normalizeBrazilPhone('+55 31 99999 8888')).toBe('+5531999998888');
    expect(normalizeBrazilPhone('031 99999-8888')).toBe('+5531999998888');
  });
  it('rejects landlines, short numbers and invalid DDD', () => {
    expect(normalizeBrazilPhone('(31) 3333-4444')).toBeNull();
    expect(normalizeBrazilPhone('9999')).toBeNull();
    expect(normalizeBrazilPhone('(01) 99999-8888')).toBeNull();
    expect(normalizeBrazilPhone('')).toBeNull();
  });
});

describe('masking', () => {
  it('masks phone and email without leaking content', () => {
    expect(maskPhone('+5531999998888')).toBe('+55 (31) 9****-**88');
    expect(maskEmail('lucas@example.org')).toBe('lu***@example.org');
    expect(maskEmail('bad')).toBe('***');
  });
});
