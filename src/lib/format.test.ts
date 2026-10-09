import { describe, expect, it } from 'vitest';
import {
  formatActivityWhen,
  formatDateNumeric,
  formatInt,
  formatPercent,
  formatPp,
  formatSignedInt,
  formatTime,
  plural,
} from './format';

describe('number formatters (pt-BR)', () => {
  it('formats integers with dot thousands separator', () => {
    expect(formatInt(1234567)).toBe('1.234.567');
    expect(formatInt(0)).toBe('0');
    expect(formatInt(null)).toBe('—');
    expect(formatInt(Number.NaN)).toBe('—');
  });

  it('formats rates as percentages with comma decimals', () => {
    expect(formatPercent(0.1234)).toBe('12,3%');
    expect(formatPercent(1)).toBe('100,0%');
    expect(formatPercent(0.5, 0)).toBe('50%');
    expect(formatPercent(undefined)).toBe('—');
  });

  it('formats percentage points with explicit sign', () => {
    expect(formatPp(1.25)).toBe('+1,3 p.p.');
    expect(formatPp(-0.44)).toBe('−0,4 p.p.');
    expect(formatPp(0)).toBe('0,0 p.p.');
    expect(formatPp(-0.01)).toBe('0,0 p.p.');
    expect(formatPp(null)).toBe('—');
  });

  it('formats signed integers', () => {
    expect(formatSignedInt(1200)).toBe('+1.200');
    expect(formatSignedInt(-30)).toBe('−30');
    expect(formatSignedInt(0)).toBe('0');
  });

  it('pluralizes', () => {
    expect(plural(1, 'bairro', 'bairros')).toBe('1 bairro');
    expect(plural(1200, 'bairro', 'bairros')).toBe('1.200 bairros');
  });
});

describe('date formatters (America/Sao_Paulo)', () => {
  it('renders UTC instants in Brasília time regardless of device timezone', () => {
    // 17:00 UTC = 14:00 in São Paulo (UTC−3, no DST since 2019)
    expect(formatTime('2026-10-10T17:00:00Z')).toBe('14:00');
    // 02:30 UTC on the 11th is still the 10th in São Paulo
    expect(formatDateNumeric('2026-10-11T02:30:00Z')).toBe('10/10/2026');
  });

  it('describes an activity window with explicit timezone', () => {
    const s = formatActivityWhen('2026-10-10T17:00:00Z', '2026-10-10T19:00:00Z');
    expect(s).toContain('10 de outubro de 2026');
    expect(s).toContain('14:00–16:00');
    expect(s).toContain('horário de Brasília');
  });

  it('handles invalid dates', () => {
    expect(formatTime('not a date')).toBe('—');
    expect(formatActivityWhen('nope')).toBe('Data a confirmar');
  });
});
