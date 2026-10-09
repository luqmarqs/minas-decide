/**
 * pt-BR formatters. All dates are rendered in America/Sao_Paulo regardless of the
 * device timezone (spec §12.14). Percentages always come from 0..1 rates.
 */
export const APP_LOCALE = 'pt-BR';
export const APP_TIMEZONE = 'America/Sao_Paulo';

const intFmt = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 0 });
const MINUS = '−';

/** 12345 → "12.345". */
export function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return intFmt.format(Math.round(n));
}

/** 0.1234 → "12,3%". */
export function formatPercent(rate: number | null | undefined, digits = 1): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  return new Intl.NumberFormat(APP_LOCALE, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(rate);
}

/** Percentage points with explicit sign: 1.25 → "+1,3 p.p.", -0.4 → "−0,4 p.p.". */
export function formatPp(delta: number | null | undefined, digits = 1): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return '—';
  const rounded = Number(delta.toFixed(digits));
  const abs = new Intl.NumberFormat(APP_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(rounded));
  const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS : '';
  return `${sign}${abs} p.p.`;
}

/** Signed integer: 1200 → "+1.200", -30 → "−30". */
export function formatSignedInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const r = Math.round(n);
  const sign = r > 0 ? '+' : r < 0 ? MINUS : '';
  return `${sign}${intFmt.format(Math.abs(r))}`;
}

function isValidDate(iso: string): boolean {
  return !Number.isNaN(new Date(iso).getTime());
}

function dateParts(iso: string, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat(APP_LOCALE, { timeZone: APP_TIMEZONE, ...opts });
  for (const p of fmt.formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

/** "sábado, 10 de outubro de 2026" (Brasília). */
export function formatDateLong(iso: string): string {
  if (!isValidDate(iso)) return '—';
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/** "10 out." (Brasília). */
export function formatDateShort(iso: string): string {
  if (!isValidDate(iso)) return '—';
  const p = dateParts(iso, { day: 'numeric', month: 'short' });
  return `${p.day ?? ''} ${p.month ?? ''}`.trim();
}

/** "14:00" (Brasília, 24h). */
export function formatTime(iso: string): string {
  if (!isValidDate(iso)) return '—';
  const p = dateParts(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.hour ?? '--'}:${p.minute ?? '--'}`;
}

/** "sábado, 10 de outubro de 2026, 14:00–16:00 (horário de Brasília)". */
export function formatActivityWhen(startsAt: string, endsAt?: string | null): string {
  if (!isValidDate(startsAt)) return 'Data a confirmar';
  const range =
    endsAt && isValidDate(endsAt)
      ? `${formatTime(startsAt)}–${formatTime(endsAt)}`
      : formatTime(startsAt);
  return `${formatDateLong(startsAt)}, ${range} (horário de Brasília)`;
}

/** "08/10/2026" (Brasília). */
export function formatDateNumeric(iso: string): string {
  if (!isValidDate(iso)) return '—';
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/** plural(1, 'bairro', 'bairros') → "1 bairro"; plural(1200, …) → "1.200 bairros". */
export function plural(n: number, one: string, many: string): string {
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}
