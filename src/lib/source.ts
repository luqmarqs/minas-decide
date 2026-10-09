/**
 * Short source labels for the interface (owner decision D32): "TSE", "TSE 2022", "IBGE",
 * "OpenStreetMap". Files, releases, hashes and dates live only on /metodologia
 * ("Proveniência"). Until highlights.json is regenerated with short `source` values, the
 * long provenance text is reduced here.
 */
export function shortSource(text: string | null | undefined): string {
  const t = (text ?? '').trim();
  if (!t) return 'TSE';
  if (/demonstra|sint[ée]tic/i.test(t)) return 'Demonstração (dados sintéticos)';
  const labels: string[] = [];
  const tse = /\bTSE\b|snapshot|dados abertos|extrato/i.test(t);
  if (tse) {
    // Dates (e.g. Last-Modified 2026) do not count: only data years in names/periods.
    const only2022 = /2022/.test(t) && !/_2026|de 2026|2026 r|snapshot|extrato/i.test(t);
    labels.push(only2022 ? 'TSE 2022' : 'TSE');
  }
  if (/\bIBGE\b/i.test(t)) labels.push('IBGE');
  if (/openstreetmap|\bOSM\b/i.test(t)) labels.push('OpenStreetMap');
  // Already short and unknown (e.g. a future curated label): keep it if it is short.
  if (!labels.length) return t.length <= 40 ? t : 'TSE';
  return labels.join(' · ');
}
