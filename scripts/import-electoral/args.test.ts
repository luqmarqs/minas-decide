import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.ts';

const NOW = new Date('2026-10-09T12:00:00Z');
const p = (...a: string[]) => parseArgs(a, NOW);

describe('export parseArgs', () => {
  it('defaults to 2026 round 1 with the audited codes', () => {
    const a = p('--all-mg');
    expect(a).toMatchObject({ year: 2026, round: 1, electionCodes: [6257, 6259], allMg: true });
    expect(a.electionCodesExplicit).toBe(false);
    expect(a.release).toBe('mg-2026r1-20261009');
    expect(a.years).toEqual([2022, 2026]);
    expect(a.maxRows).toBe(5_000_000);
  });
  it('accepts explicit election codes (deduplicated)', () => {
    const a = p('--year', '2026', '--round', '2', '--election-codes', '7001,7003,7001');
    expect(a.round).toBe(2);
    expect(a.electionCodes).toEqual([7001, 7003]);
    expect(a.electionCodesExplicit).toBe(true);
    expect(a.release).toBe('mg-2026r2-20261009');
  });
  it('does not guess codes for unknown (year, round)', () => {
    expect(() => p('--year', '2026', '--round', '2')).toThrow(/--election-codes/);
    expect(() => p('--year', '2030')).toThrow(/--election-codes/);
  });
  it('validates flags', () => {
    expect(() => p('--round', '3', '--election-codes', '1')).toThrow(/1 or 2/);
    expect(() => p('--round', 'x')).toThrow();
    expect(() => p('--election-codes', '6257;DROP')).toThrow();
    expect(() => p('--municipality', '31400')).toThrow(/7-digit/);
    expect(() => p('--max-rows', '-5')).toThrow();
    expect(() => p('--release')).toThrow(/requires a value/);
    expect(() => p('--release', '--dry-run')).toThrow(/requires a value/);
  });
  it('names municipality releases with election scope', () => {
    expect(p('--municipality', '3140001').release).toBe('mg-3140001-2026r1-20261009');
    expect(p('--dry-run').dryRun).toBe(true);
    expect(p('--release', 'x', '--output', 'out').output).toBe('out');
  });
  it('flags unverified totals acceptance', () => {
    expect(p('--accept-unverified-totals').acceptUnverifiedTotals).toBe(true);
    expect(p().acceptUnverifiedTotals).toBe(false);
  });
});
