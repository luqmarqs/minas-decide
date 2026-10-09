import { useEffect, useState } from 'react';
import type { AdminRevealContactResponse } from '@shared/contracts/admin.ts';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { formatDateNumeric, formatTime } from '@/lib/format';
import { revealProposalContact } from './api';
import { adminErrorMessage, isForbidden } from './errors';

/**
 * "Revelar contato do proponente": audited server-side, (D35: no second factor required; still audited)
 * session. The full e-mail/phone live only in this component's state: they are
 * never cached, and disappear when the review closes or the tab is hidden.
 */
export function RevealContact({ proposalId }: { proposalId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<AdminRevealContactResponse | null>(null);

  // "Some ao sair da tela": hide the contact when the page goes to the background.
  useEffect(() => {
    if (!contact) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') setContact(null);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [contact]);

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      setContact(await revealProposalContact(proposalId));
      setConfirming(false);
    } catch (err) {
      setError(
        isForbidden(err)
          ? 'Sem permissão. Para ver o contato é preciso estar na lista de administradores. A tentativa foi registrada.'
          : adminErrorMessage(err),
      );
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (contact) {
    return (
      <section
        aria-label="Contato do proponente (revelado)"
        className="flex flex-col gap-2 rounded-md border border-error/40 bg-error-soft/40 p-3 text-sm"
      >
        <p className="font-semibold">Contato do proponente — uso restrito</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-medium text-secondary">E-mail</dt>
          <dd className="font-mono break-all">{contact.proposer_email}</dd>
          <dt className="font-medium text-secondary">WhatsApp</dt>
          <dd className="font-mono">{contact.proposer_phone}</dd>
        </dl>
        <p className="text-xs text-secondary">
          Acesso registrado na auditoria em {formatDateNumeric(contact.revealed_at)}{' '}
          {formatTime(contact.revealed_at)}. Não copie para fora do canal oficial; o contato some ao
          fechar esta revisão ou trocar de aba.
        </p>
        <div>
          <Button size="sm" variant="ghost" onClick={() => setContact(null)}>
            Ocultar contato
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted">
        Contatos chegam mascarados. Revelar fica registrado na auditoria.
      </p>
      <div>
        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          Revelar contato do proponente
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          title="Revelar contato do proponente?"
          description="O e-mail e o WhatsApp completos serão exibidos e este acesso ficará registrado na auditoria com seu usuário e horário. Use somente para falar com o proponente sobre esta proposta."
        >
          <div className="flex flex-wrap gap-2">
            <Button loading={busy} loadingText="Revelando…" onClick={() => void reveal()}>
              Revelar e registrar acesso
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
