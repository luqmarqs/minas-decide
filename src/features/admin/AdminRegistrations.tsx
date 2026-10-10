import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { AdminRegistration } from '@shared/contracts/admin.ts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, Note } from '@/components/ui/States';
import { formatDateNumeric, formatInt, formatTime, plural } from '@/lib/format';
import { downloadRegistrationsCsv, fetchRegistrations } from './api';
import { registrationsErrorMessage } from './errors';
import './registrations.css';

const DEBOUNCE_MS = 300;

/** `+5531999990000` -> `(31) 99999-0000`; unknown shapes pass through. */
function phoneBr(e164: string | null): string {
  if (!e164) return '—';
  const m = /^\+55(\d{2})(\d{5})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function Row({ r }: { r: AdminRegistration }) {
  return (
    <tr>
      <td data-label="Nome" className="font-medium">
        {r.display_name}
      </td>
      <td data-label="E-mail">{r.email}</td>
      <td data-label="WhatsApp" className="adm-reg-num">
        {phoneBr(r.phone)}
      </td>
      <td data-label="Território">{r.territory_name ?? '—'}</td>
      <td data-label="Comunicações">{r.contact_opt_in ? 'sim' : 'não'}</td>
      <td data-label="Situação">
        <span className="flex flex-wrap justify-end gap-1 md:justify-start">
          {r.account_state === 'suspended' ? (
            <Badge variant="warning">suspensa</Badge>
          ) : (
            <span>ativa</span>
          )}
          {r.email_verification_state !== 'verified' ? (
            <Badge variant="info">e-mail não verificado</Badge>
          ) : null}
        </span>
      </td>
      <td data-label="Cadastro" className="adm-reg-num">
        {formatDateNumeric(r.created_at)} {formatTime(r.created_at)}
      </td>
    </tr>
  );
}

/**
 * "Cadastros": the registered people (PERSONAL DATA). Reads and the CSV export are decided and
 * audited by the server; nothing is cached after leaving the tab (gcTime 0).
 */
export function AdminRegistrations() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [download, setDownload] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text]);

  const query = useInfiniteQuery({
    queryKey: ['admin', 'registrations', q],
    queryFn: ({ pageParam, signal }) => fetchRegistrations(pageParam, q, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  async function onDownload() {
    setDownloading(true);
    setDownload(null);
    try {
      const { blob, filename } = await downloadRegistrationsCsv(q);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownload({ tone: 'ok', text: `Arquivo ${filename} gerado. O acesso foi registrado.` });
    } catch (err) {
      setDownload({ tone: 'error', text: registrationsErrorMessage(err, 'download') });
    } finally {
      setDownloading(false);
    }
  }

  const searching = q !== text.trim();
  let status = '';
  if (query.isSuccess && !searching) status = plural(total, 'resultado', 'resultados');

  return (
    <div className="adm-reg flex flex-col gap-5">
      <Note tone="warning">
        Dados pessoais — uso restrito à campanha; acessos ficam registrados na auditoria.
      </Note>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="sm:max-w-md sm:flex-1">
          <Field label="Buscar por nome, e-mail ou território" id="reg-q">
            {(props) => (
              <Input
                {...props}
                type="search"
                autoComplete="off"
                maxLength={100}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Button
          variant="secondary"
          onClick={() => void onDownload()}
          loading={downloading}
          loadingText="Gerando arquivo…"
          disabled={query.isLoading || Boolean(query.error)}
        >
          Baixar CSV
        </Button>
      </div>

      <p role="status" aria-live="polite" className="text-sm text-muted">
        {status}
      </p>
      {download ? (
        <p
          role={download.tone === 'error' ? 'alert' : 'status'}
          className={download.tone === 'ok' ? 'text-success' : 'text-error'}
        >
          {download.text}
        </p>
      ) : null}

      {query.isLoading ? (
        <LoadingBlock label="Carregando cadastros…" lines={6} />
      ) : query.error && rows.length === 0 ? (
        <ErrorState
          title="Lista indisponível"
          message={registrationsErrorMessage(query.error, 'list')}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={q ? 'Nenhum cadastro encontrado.' : 'Ainda não há cadastros.'}
          description={q ? 'Tente outro nome, e-mail ou território.' : undefined}
        />
      ) : (
        <>
          <table className="adm-reg-table">
            <caption>
              Cadastros, do mais recente para o mais antigo ({formatInt(rows.length)} de{' '}
              {formatInt(total)})
            </caption>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">E-mail</th>
                <th scope="col">WhatsApp</th>
                <th scope="col">Território</th>
                <th scope="col">Comunicações</th>
                <th scope="col">Situação</th>
                <th scope="col">Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.user_id} r={r} />
              ))}
            </tbody>
          </table>
          {query.error ? (
            <p role="alert" className="text-error">
              {registrationsErrorMessage(query.error, 'list')}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted tabular-nums">
              {formatInt(rows.length)} de {formatInt(total)}
            </p>
            {query.hasNextPage ? (
              <Button
                variant="secondary"
                onClick={() => void query.fetchNextPage()}
                loading={query.isFetchingNextPage}
                loadingText="Carregando…"
              >
                Carregar mais
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
