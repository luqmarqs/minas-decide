import type { AdminRegistration } from '../../shared/contracts/admin.ts';
import type { Cursor } from '../repositories/types.ts';

/**
 * CSV export of the registrations (PERSONAL DATA in bulk, admin only, audited by the route).
 * Excel pt-BR friendly: UTF-8 BOM, `;` separator, CRLF, Brasília dates, formula-injection
 * guard. Generated as a stream in keyset batches so memory stays flat and the PostgREST
 * 1000-row ceiling never applies (no offset/range anywhere).
 */
export const EXPORT_BATCH_SIZE = 1000;
/** Safety net against a repository that never advances the cursor (1000 batches = 1M rows). */
const MAX_BATCHES = 1000;

export const CSV_HEADER = [
  'Nome',
  'E-mail',
  'WhatsApp',
  'Território',
  'Aceita comunicações',
  'E-mail verificado',
  'Situação da conta',
  'Versão do termo',
  'Cadastrado em (Brasília)',
] as const;

/**
 * Cells that a spreadsheet would run as a formula (`= + - @`, tab, CR) get a leading `'`;
 * then the cell is quoted when it holds `;`, `"` or a line break.
 */
export function csvCell(value: string | null | undefined): string {
  let cell = value ?? '';
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[;"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function csvLine(cells: (string | null | undefined)[]): string {
  return `${cells.map(csvCell).join(';')}\r\n`;
}

/** `+5531999990000` -> `(31) 99999-0000` (also avoids the leading `+`); unknown shapes pass through. */
export function formatPhoneBr(e164: string | null): string {
  if (!e164) return '';
  const m = /^\+55(\d{2})(\d{5})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const BRASILIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** ISO -> `dd/mm/aaaa hh:mm:ss` in America/Sao_Paulo (empty when unparsable). */
export function formatBrasilia(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const p: Record<string, string> = {};
  for (const part of BRASILIA.formatToParts(new Date(ms))) p[part.type] = part.value;
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/** `YYYY-MM-DD` of Brasília for the file name. */
export function brasiliaDate(ms: number): string {
  return new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
}

const VERIFICATION = { verified: 'verificado', pending: 'pendente', unverified: 'não verificado' };
const ACCOUNT = { active: 'ativa', suspended: 'suspensa' };

export function registrationLine(r: AdminRegistration): string {
  return csvLine([
    r.display_name,
    r.email,
    formatPhoneBr(r.phone),
    r.territory_name,
    r.contact_opt_in ? 'sim' : 'não',
    VERIFICATION[r.email_verification_state],
    ACCOUNT[r.account_state],
    r.consent_version,
    formatBrasilia(r.created_at),
  ]);
}

export interface CsvStreamHooks {
  /** called once when the stream ends or breaks; `rows` = rows actually written */
  onEnd: (outcome: { rows: number; error: boolean; cancelled: boolean }) => void;
}

/**
 * Fetches the FIRST batch eagerly (a repository failure then becomes a normal 500 instead of a
 * broken download) and returns a pull-based byte stream that walks the rest by keyset. A
 * repository error mid-way errors the stream (the browser sees a failed download).
 */
export async function registrationsCsvStream(
  fetchBatch: (after: Cursor | null) => Promise<AdminRegistration[]>,
  hooks: CsvStreamHooks,
): Promise<ReadableStream<Uint8Array>> {
  const enc = new TextEncoder();
  let page = await fetchBatch(null);
  let rows = 0;
  let batches = 0;
  let first = true;
  let done = false;
  const finish = (error: boolean, cancelled: boolean) => {
    if (done) return;
    done = true;
    hooks.onEnd({ rows, error, cancelled });
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!first) {
          const last = page[page.length - 1];
          if (page.length < EXPORT_BATCH_SIZE || !last || ++batches >= MAX_BATCHES) {
            finish(false, false);
            controller.close();
            return;
          }
          page = await fetchBatch({ at: last.created_at, id: last.user_id });
          if (page.length === 0) {
            finish(false, false);
            controller.close();
            return;
          }
        }
        let text = first ? `\uFEFF${csvLine([...CSV_HEADER])}` : '';
        first = false;
        for (const r of page) text += registrationLine(r);
        rows += page.length;
        controller.enqueue(enc.encode(text));
        if (page.length < EXPORT_BATCH_SIZE) {
          finish(false, false);
          controller.close();
        }
      } catch (err) {
        finish(true, false);
        controller.error(err);
      }
    },
    cancel() {
      finish(false, true);
    },
  });
}
