import { describe, expect, it } from 'vitest';
import { normalizeText, slugify } from './normalize.ts';

describe('normalizeText', () => {
  it('strips accents, case, punctuation and whitespace', () => {
    expect(normalizeText('  São João del-Rei ')).toBe('sao joao del rei');
    expect(normalizeText("Pouso Alegre")).toBe('pouso alegre');
    expect(normalizeText('BRASÍLIA DE MINAS')).toBe('brasilia de minas');
  });
});

describe('slugify', () => {
  it('produces url-safe slugs', () => {
    expect(slugify('São João del-Rei')).toBe('sao-joao-del-rei');
    expect(slugify('Centro')).toBe('centro');
    expect(slugify('Zona Rural / Sede')).toBe('zona-rural-sede');
  });
});
