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
