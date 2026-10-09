/**
 * Argument parsing for export.ts (pure; unit-tested in args.test.ts).
 *
 * Election scope (P-DATA-3): `--year` + `--round` select the election. For
 * 2026 round 1 the known SOURCE codes (6257 president, 6259 others; see
 * docs/DATA_SOURCE_AUDIT.md) are the default. For any other (year, round) the
 * codes MUST be passed with `--election-codes`: nothing is guessed.
 */
export interface ExportArgs {
  dryRun: boolean;
  municipality?: string;
  allMg: boolean;
  years: number[];
  year: number;
  round: number;
  electionCodes: number[];
  electionCodesExplicit: boolean;
  acceptUnverifiedTotals: boolean;
  output: string;
  maxRows: number;
  batchSize: number;
  pauseMs: number;
  release: string;
}

/** Known SOURCE codes, keyed `${year}r${round}`. Only what the audit confirmed. */
export const KNOWN_ELECTION_CODES: Record<string, number[]> = { '2026r1': [6257, 6259] };

const intFlag = (name: string, v: string | undefined, def: number, min = 0): number => {
  const n = v === undefined ? def : Number(v);
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} expects an integer >= ${min}`);
  return n;
};

export function parseArgs(argv: string[], now: Date = new Date()): ExportArgs {
  const get = (k: string) => {
    const i = argv.indexOf(k);
    if (i < 0) return undefined;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${k} requires a value`);
    return v;
  };
  const today = now.toISOString().slice(0, 10).replace(/-/g, '');
  const municipality = get('--municipality');
  if (municipality && !/^\d{7}$/.test(municipality))
    throw new Error('--municipality expects a 7-digit IBGE code');
  const year = intFlag('--year', get('--year'), 2026, 2000);
  const round = intFlag('--round', get('--round'), 1, 1);
  if (round > 2) throw new Error('--round expects 1 or 2');
  const codesRaw = get('--election-codes');
  let electionCodes: number[];
  if (codesRaw !== undefined) {
    if (!/^\d{1,6}(,\d{1,6})*$/.test(codesRaw))
      throw new Error('--election-codes expects comma-separated digits, e.g. 6257,6259');
    electionCodes = [...new Set(codesRaw.split(',').map(Number))];
  } else {
    const known = KNOWN_ELECTION_CODES[`${year}r${round}`];
    if (!known)
      throw new Error(
        `No known SOURCE election codes for ${year} round ${round}; pass --election-codes <c1,c2> (confirm them in SOURCE first).`,
      );
    electionCodes = known;
  }
  const yearsRaw = get('--years') ?? `2022,${year}`;
  const years = yearsRaw.split(',').map(Number);
  if (years.some((y) => !Number.isInteger(y))) throw new Error('--years expects integers');
  return {
    dryRun: argv.includes('--dry-run'),
    municipality,
    allMg: argv.includes('--all-mg'),
    years,
    year,
    round,
    electionCodes,
    electionCodesExplicit: codesRaw !== undefined,
    acceptUnverifiedTotals: argv.includes('--accept-unverified-totals'),
    output: get('--output') ?? '',
    maxRows: intFlag('--max-rows', get('--max-rows'), 5_000_000, 1),
    batchSize: intFlag('--batch-size', get('--batch-size'), 40, 1),
    pauseMs: intFlag('--pause-ms', get('--pause-ms'), 400),
    release:
      get('--release') ??
      (municipality
        ? `mg-${municipality}-${year}r${round}-${today}`
        : `mg-${year}r${round}-${today}`),
  };
}
