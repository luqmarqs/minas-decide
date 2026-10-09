/**
 * Brazilian mobile phone normalization to E.164 (+55DDNNNNNNNNN).
 * Accepts formats like "(31) 99999-8888", "31999998888", "+55 31 99999 8888".
 * Mobile numbers must have 9 digits after the DDD and start with 9.
 */
export function normalizeBrazilPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let national = digits;
  if (national.startsWith('55') && (national.length === 12 || national.length === 13)) {
    national = national.slice(2);
  }
  if (national.startsWith('0') && national.length === 12) national = national.slice(1);
  if (national.length !== 11) return null;
  const ddd = national.slice(0, 2);
  const number = national.slice(2);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  if (!/^9\d{8}$/.test(number)) return null;
  return `+55${ddd}${number}`;
}

export function maskPhone(e164: string): string {
  if (!e164.startsWith('+55') || e164.length !== 14) return '***';
  return `+55 (${e164.slice(3, 5)}) 9****-**${e164.slice(12)}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}
