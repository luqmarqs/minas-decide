/**
 * Minimal ZIP reader over HTTP Range for TSE open-data archives (cdn.tse.jus.br).
 * Shared by sample-check.ts (rodada 2) and fetch-2022.ts (rodada 3).
 *
 * Only the central directory and the requested entries are downloaded. Each entry's CRC-32
 * is verified. Downloaded bytes are only ever PARSED as CSV text (latin1, `;`-separated);
 * nothing downloaded is executed. ZIP64 (entries/offsets ≥ 4 GiB) is supported for reading.
 */
import { createInflateRaw, crc32 } from 'node:zlib';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

export const TSE_UA = 'Mozilla/5.0 (minas-decide tse-open-data; read-only)';

export interface HttpAttempt {
  url: string;
  range?: string;
  status: number | string;
  note?: string;
}

export interface ZipEntry {
  name: string;
  method: number;
  csize: number;
  usize: number;
  crc: number;
  offset: number;
}

export interface RangeClient {
  attempts: HttpAttempt[];
  offline: boolean;
  userAgent: string;
}

export function createClient(opts: { offline?: boolean; userAgent?: string } = {}): RangeClient {
  return { attempts: [], offline: opts.offline ?? false, userAgent: opts.userAgent ?? TSE_UA };
}

async function request(c: RangeClient, url: string, range?: string): Promise<Response> {
  if (c.offline) throw new Error(`--offline: ${url} not cached`);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': c.userAgent, ...(range ? { Range: range } : {}) },
      redirect: 'follow',
    });
  } catch (e) {
    c.attempts.push({ url, range, status: 'network error', note: (e as Error).message });
    throw e;
  }
  c.attempts.push({ url, range, status: res.status });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

export async function http(
  c: RangeClient,
  url: string,
  range?: string,
): Promise<{ buf: Buffer; headers: Headers }> {
  const res = await request(c, url, range);
  return { buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}

/** Parses the ZIP64 extended-information extra field of a central-directory record. */
function applyZip64(extra: Buffer, e: { usize: number; csize: number; offset: number }): void {
  let p = 0;
  while (p + 4 <= extra.length) {
    const id = extra.readUInt16LE(p);
    const len = extra.readUInt16LE(p + 2);
    if (id === 0x0001) {
      let q = p + 4;
      const rd = () => {
        const v = Number(extra.readBigUInt64LE(q));
        q += 8;
        return v;
      };
      if (e.usize === 0xffffffff) e.usize = rd();
      if (e.csize === 0xffffffff) e.csize = rd();
      if (e.offset === 0xffffffff) e.offset = rd();
      return;
    }
    p += 4 + len;
  }
}

export async function zipDirectory(
  c: RangeClient,
  url: string,
): Promise<{ entries: ZipEntry[]; lastModified: string; totalBytes: number }> {
  const tail = await http(c, url, 'bytes=-1048576');
  const cr = tail.headers.get('content-range'); // bytes a-b/total
  const total = cr ? Number(cr.split('/')[1]) : tail.buf.length;
  const b = tail.buf;
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('zip: EOCD not found');
  let size = b.readUInt32LE(eocd + 12);
  let off = b.readUInt32LE(eocd + 16);
  if (off === 0xffffffff || size === 0xffffffff) {
    // ZIP64 end of central directory locator precedes the EOCD
    const loc = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]), eocd);
    if (loc < 0) throw new Error('zip64: locator not found');
    const z64Off = Number(b.readBigUInt64LE(loc + 8));
    const z64 = z64Off - (total - b.length);
    if (z64 < 0 || b.readUInt32LE(z64) !== 0x06064b50) throw new Error('zip64: EOCD64 not found');
    size = Number(b.readBigUInt64LE(z64 + 40));
    off = Number(b.readBigUInt64LE(z64 + 48));
  }
  const start = b.length - (total - off);
  if (start < 0) throw new Error('zip: central directory outside fetched tail');
  const entries: ZipEntry[] = [];
  let p = start;
  while (p < start + size && b.readUInt32LE(p) === 0x02014b50) {
    const nl = b.readUInt16LE(p + 28);
    const el = b.readUInt16LE(p + 30);
    const cl = b.readUInt16LE(p + 32);
    const e: ZipEntry = {
      method: b.readUInt16LE(p + 10),
      crc: b.readUInt32LE(p + 16),
      csize: b.readUInt32LE(p + 20),
      usize: b.readUInt32LE(p + 24),
      offset: b.readUInt32LE(p + 42),
      name: b.subarray(p + 46, p + 46 + nl).toString('latin1'),
    };
    applyZip64(b.subarray(p + 46 + nl, p + 46 + nl + el), e);
    entries.push(e);
    p += 46 + nl + el + cl;
  }
  return { entries, lastModified: tail.headers.get('last-modified') ?? '', totalBytes: total };
}

/** Fetches one entry (streamed) and yields decoded (latin1) CSV lines; verifies CRC-32. */
export async function* entryLines(
  c: RangeClient,
  url: string,
  e: ZipEntry,
): AsyncGenerator<string> {
  const head = await http(c, url, `bytes=${e.offset}-${e.offset + 29}`);
  const dataStart = e.offset + 30 + head.buf.readUInt16LE(26) + head.buf.readUInt16LE(28);
  const res = await request(c, url, `bytes=${dataStart}-${dataStart + e.csize - 1}`);
  if (!res.body) throw new Error(`entry ${e.name}: empty body`);
  const body = Readable.fromWeb(res.body as WebReadableStream);
  let received = 0;
  body.on('data', (ch: Buffer) => (received += ch.length));
  const raw = e.method === 0 ? body : body.pipe(createInflateRaw());
  let crc = 0;
  let carry = '';
  for await (const chunk of raw as AsyncIterable<Buffer>) {
    crc = crc32(chunk, crc);
    const text = carry + chunk.toString('latin1');
    const parts = text.split('\n');
    carry = parts.pop() ?? '';
    for (const l of parts) yield l.replace(/\r$/, '');
  }
  if (carry) yield carry;
  if (received !== e.csize) throw new Error(`entry ${e.name}: short read (${received}/${e.csize})`);
  if (crc >>> 0 !== e.crc) throw new Error(`entry ${e.name}: CRC-32 mismatch`);
}

export const splitCsv = (line: string): string[] =>
  line.split(';').map((c) => (c.startsWith('"') && c.endsWith('"') ? c.slice(1, -1) : c));

/** Streams the rows of a `;`-separated CSV entry as header-keyed records. */
export async function forEachCsvRow(
  c: RangeClient,
  url: string,
  e: ZipEntry,
  onRow: (r: Record<string, string>) => void,
): Promise<number> {
  let header: string[] | null = null;
  let n = 0;
  for await (const line of entryLines(c, url, e)) {
    if (!line) continue;
    const cells = splitCsv(line);
    if (!header) {
      header = cells;
      continue;
    }
    const r: Record<string, string> = {};
    header.forEach((h, i) => (r[h] = cells[i] ?? ''));
    onRow(r);
    n++;
  }
  return n;
}

export async function csvRows(
  c: RangeClient,
  url: string,
  e: ZipEntry,
  keep: (r: Record<string, string>) => boolean,
): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = [];
  await forEachCsvRow(c, url, e, (r) => {
    if (keep(r)) out.push(r);
  });
  return out;
}
