/**
 * Analytics: Umami self-hosted (owner decision, 2026-10-10). Cookie-less, no PII, no
 * fingerprinting; page views + SPA route changes are tracked by the official tracker.
 *
 * Configuration is PUBLIC build-time env (VITE_*):
 *   VITE_UMAMI_SCRIPT_URL  https://<umami-host>/script.js   (absent → analytics disabled)
 *   VITE_UMAMI_WEBSITE_ID  website id (UUID) from the Umami dashboard
 *   VITE_UMAMI_DOMAINS     optional comma list; the tracker only sends on these hostnames
 *                          (keeps local/preview traffic out of the real site's numbers)
 *
 * The tracker loads after idle, never blocks first paint, honours Do Not Track / Global
 * Privacy Control (`data-do-not-track`), and is skipped with `?analytics=0` for debugging.
 * The CSP (`public/_headers`) allows only the tracker origin (see vite.config.ts).
 */
import { whenIdle } from './idle';

export interface UmamiConfig {
  scriptUrl: string;
  websiteId: string;
  domains?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validated config from the env, or null when analytics is not configured / invalid. */
export function readUmamiConfig(env: Record<string, string | undefined>): UmamiConfig | null {
  const scriptUrl = (env.VITE_UMAMI_SCRIPT_URL ?? '').trim();
  const websiteId = (env.VITE_UMAMI_WEBSITE_ID ?? '').trim();
  if (!scriptUrl || !websiteId) return null;
  let url: URL;
  try {
    url = new URL(scriptUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !UUID_RE.test(websiteId)) return null;
  const domains = (env.VITE_UMAMI_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter((d) => /^[a-z0-9.-]+$/.test(d))
    .join(',');
  return { scriptUrl: url.toString(), websiteId, ...(domains ? { domains } : {}) };
}

/** Origin of the tracker (for the CSP) or null. Pure; also used by the Vite build plugin. */
export function umamiOrigin(scriptUrl: string | undefined): string | null {
  try {
    const u = new URL(scriptUrl ?? '');
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

export const UMAMI_SCRIPT_ID = 'mm-umami';

/** Inserts the tracker `<script>` once. Returns the element, or null when skipped. */
export function mountUmami(cfg: UmamiConfig, doc: Document = document): HTMLScriptElement | null {
  if (doc.getElementById(UMAMI_SCRIPT_ID)) return null;
  const s = doc.createElement('script');
  s.id = UMAMI_SCRIPT_ID;
  s.defer = true;
  s.src = cfg.scriptUrl;
  s.setAttribute('data-website-id', cfg.websiteId);
  s.setAttribute('data-do-not-track', 'true');
  if (cfg.domains) s.setAttribute('data-domains', cfg.domains);
  doc.head.appendChild(s);
  return s;
}

function optedOut(): boolean {
  try {
    return new URL(window.location.href).searchParams.get('analytics') === '0';
  } catch {
    return false;
  }
}

/** App entry: schedule the tracker after idle when configured. No-op otherwise. */
export function initAnalytics(env: Record<string, string | undefined> = import.meta.env): void {
  const cfg = readUmamiConfig(env);
  if (!cfg || typeof document === 'undefined' || optedOut()) return;
  whenIdle(() => mountUmami(cfg), { timeout: 4000 });
}
