/**
 * Share a link with the Web Share API, falling back to copying it to the
 * clipboard. Never throws; returns what actually happened so the UI only says
 * "Link copiado" when the copy really succeeded.
 */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareInput {
  title: string;
  text?: string;
  url: string;
}

export async function shareOrCopy(input: ShareInput): Promise<ShareOutcome> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav && typeof nav.share === 'function') {
    try {
      if (typeof nav.canShare !== 'function' || nav.canShare(input)) {
        await nav.share(input);
        return 'shared';
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // otherwise fall through to clipboard
    }
  }
  return copyText(input.url);
}

export async function copyText(text: string): Promise<ShareOutcome> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    // try legacy path below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok ? 'copied' : 'failed';
  } catch {
    return 'failed';
  }
}

export function absoluteUrl(pathAndQuery: string): string {
  if (typeof window === 'undefined') return pathAndQuery;
  return new URL(pathAndQuery, window.location.origin).toString();
}

export const SHARE_FEEDBACK: Record<ShareOutcome, string> = {
  shared: 'Link compartilhado.',
  copied: 'Link copiado para a área de transferência.',
  cancelled: '',
  failed: 'Não foi possível copiar o link. Copie pela barra de endereço.',
};

// ---------------------------------------------------------------------------
// WhatsApp sharing (owner decision D26): every "Compartilhar" opens WhatsApp with a ready
// PT-BR message. Rendered as a real <a href> (no popup blocking on mobile); "copiar link"
// survives only as a discreet secondary action.
// ---------------------------------------------------------------------------

export const SITE_SIGNATURE = 'Minas Decide Lula';

/** https://wa.me/?text=… (WhatsApp picks the contact/group). */
export function whatsAppHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Imperative variant (buttons without an anchor). Opens a new tab without opener. */
export function shareOnWhatsApp(text: string): void {
  if (typeof window === 'undefined') return;
  window.open(whatsAppHref(text), '_blank', 'noopener,noreferrer');
}

function spParts(iso: string): Record<string, string> {
  const out: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  for (const p of fmt.formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

/** "sexta-feira, 16/10 às 09:00 (horário de Brasília)". */
export function shareWhen(iso: string): string {
  if (Number.isNaN(new Date(iso).getTime())) return 'data a confirmar';
  const p = spParts(iso);
  return `${p.weekday}, ${p.day}/${p.month} às ${p.hour}:${p.minute} (horário de Brasília)`;
}

function shortText(text: string | null | undefined, max = 140): string | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export interface ActivityShareInput {
  id: string;
  title: string;
  starts_at: string;
  location_public: string;
  description_sanitized?: string | null;
  /** "Centro — Belo Horizonte/MG" / "Belo Horizonte/MG" (omitted when unknown). */
  placeLabel?: string | null;
  origin?: string;
}

export function activityShareText(a: ActivityShareInput): string {
  const origin = a.origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const url = `${origin}/atividade/${a.id}`;
  const place = a.placeLabel ? `${a.location_public} — ${a.placeLabel}` : a.location_public;
  const desc = shortText(a.description_sanitized);
  return [
    a.title,
    `📅 ${shareWhen(a.starts_at)}`,
    `📍 ${place}`,
    ...(desc ? [desc] : []),
    `Confirme que vai e veja no mapa: ${url}`,
    SITE_SIGNATURE,
  ].join('\n');
}

export interface TerritoryShareInput {
  name: string;
  url: string;
  /** 0..1 rates/shares; omitted parts are dropped from the sentence. */
  abstentionRate?: number | null;
  lulaShare?: number | null;
  bolsonaroShare?: number | null;
}

const pct = (r: number) =>
  `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(r * 100)} %`;

export function territoryShareText(t: TerritoryShareInput): string {
  const parts: string[] = [];
  if (t.abstentionRate != null) parts.push(`abstenção ${pct(t.abstentionRate)}`);
  if (t.lulaShare != null && t.bolsonaroShare != null)
    parts.push(`Lula ${pct(t.lulaShare)} × Bolsonaro ${pct(t.bolsonaroShare)}`);
  else if (t.lulaShare != null) parts.push(`Lula ${pct(t.lulaShare)}`);
  else if (t.bolsonaroShare != null) parts.push(`Bolsonaro ${pct(t.bolsonaroShare)}`);
  const facts = parts.length ? `: ${parts.join(', ')} no 1º turno de 2026` : '';
  return `${t.name}${facts} — veja no mapa: ${t.url}`;
}

export function homeShareText(origin?: string): string {
  const o = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `Minas decide. Minas decide Lula. Veja o mapa de Minas cidade por cidade, encontre uma atividade da campanha perto de você e marque “Eu vou”: ${o}/\n${SITE_SIGNATURE}`;
}
