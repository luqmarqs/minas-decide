import { useState, type FormEvent } from 'react';
import { ModerationDecision } from '@shared/contracts/admin.ts';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Textarea } from '@/components/ui/Input';
import { adminErrorMessage } from './errors';

export type ModerationKind = 'approve' | 'reject' | 'suspend' | 'unsuspend';

export interface ModerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: ModerationKind;
  subject: string;
  onConfirm: (reason: string) => Promise<void>;
  /** Extra sentence for the description (e.g. "volta para análise"). */
  detail?: string;
}

const COPY: Record<
  ModerationKind,
  { title: string; action: string; variant: 'primary' | 'danger'; text: (s: string) => string }
> = {
  approve: {
    title: 'Confirmar aprovação',
    action: 'Aprovar',
    variant: 'primary',
    text: (s) => `“${s}” ficará visível publicamente.`,
  },
  reject: {
    title: 'Confirmar rejeição',
    action: 'Rejeitar',
    variant: 'danger',
    text: (s) => `“${s}” não será publicado. O motivo pode ser mostrado a quem propôs.`,
  },
  suspend: {
    title: 'Confirmar suspensão',
    action: 'Suspender',
    variant: 'danger',
    text: (s) => `“${s}” sai imediatamente do mapa e das páginas públicas.`,
  },
  unsuspend: {
    title: 'Confirmar reativação',
    action: 'Reativar',
    variant: 'primary',
    text: (s) => `A suspensão de “${s}” será retirada.`,
  },
};

/** Approve/reject with a mandatory, audited reason and explicit confirmation. */
export function ModerationDialog({
  open,
  onOpenChange,
  decision,
  subject,
  onConfirm,
  detail,
}: ModerationDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = COPY[decision];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = ModerationDecision.safeParse({ reason });
    if (!parsed.success) {
      setError('Escreva o motivo (de 3 a 500 caracteres). Ele fica registrado na auditoria.');
      document.getElementById('mod-reason')?.focus();
      return;
    }
    setError(null);
    setSubmitError(null);
    setBusy(true);
    try {
      await onConfirm(parsed.data.reason);
      setReason('');
      onOpenChange(false);
    } catch (err) {
      setSubmitError(adminErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={copy.title}
        description={`${copy.text(subject)}${detail ? ` ${detail}` : ''}`}
      >
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Motivo" required id="mod-reason" error={error ?? undefined}>
            {(p) => (
              <Textarea
                {...p}
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </Field>
          {submitError ? (
            <p role="alert" className="rounded-md bg-error-soft p-3 text-sm">
              {submitError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={copy.variant} loading={busy}>
              {copy.action}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Voltar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
