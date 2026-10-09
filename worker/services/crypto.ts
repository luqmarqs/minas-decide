/** WebCrypto helpers (no custom crypto). */
const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(input)));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecodeToString(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function randomToken(bytes = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Opaque cursor helpers: base64url(JSON). Invalid cursors return null. */
export function encodeCursor(value: Record<string, string>): string {
  return base64UrlEncode(enc.encode(JSON.stringify(value)));
}

export function decodeCursor(
  cursor: string | undefined,
  keys: string[],
): Record<string, string> | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(base64UrlDecodeToString(cursor));
    if (!parsed || typeof parsed !== 'object') return null;
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = (parsed as Record<string, unknown>)[k];
      if (typeof v !== 'string' || v.length > 100) return null;
      out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}
