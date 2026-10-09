// TOTP RFC 6238 (SHA-1, 30 s, 6 dígitos) para validação local do enrolamento de MFA.
// Só para testes com usuários descartáveis; não é usado pelo app.
import { createHmac } from 'node:crypto';

export function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new Error('base32 inválido');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const off = h[h.length - 1] & 0xf;
  const code = (h.readUInt32BE(off) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

// RFC 6238 apêndice B (segredo ASCII "12345678901234567890", T=59 → 94287082 → 6 dígitos 287082).
if (process.argv[1] && process.argv[1].endsWith('totp.mjs')) {
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const got = totp(rfcSecret, 59_000);
  console.log(`RFC 6238 vetor T=59: ${got} ${got === '287082' ? 'OK' : 'FALHOU'}`);
}
