import { useState, type FormEvent } from 'react';
import { ModerationDecision } from '@shared/contracts/admin.ts';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Textarea } from '@/components/ui/Input';
import { adminErrorMessage } from './errors';

export interface ModerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: 'approve' | 'reject';
  subject: string;
  onConfirm: (reason: string) => Promise<void>;
}

/** Approve/reject with a mandatory, audited reason and explicit confirmation. */
export function ModerationDialog({
  open,
  onOpenChange,
  decision,
  subject,
  onConfirm,
}: ModerationDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const approve = decision === 'approve';

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
        title={approve ? 'Confirmar aprovação' : 'Confirmar rejeição'}
        description={
          approve
            ? `“${subject}” ficará visível publicamente.`
            : `“${subject}” não será publicado. O motivo pode ser mostrado a quem propôs.`
        }
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
            <Button type="submit" variant={approve ? 'primary' : 'danger'} loading={busy}>
              {approve ? 'Aprovar' : 'Rejeitar'}
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
