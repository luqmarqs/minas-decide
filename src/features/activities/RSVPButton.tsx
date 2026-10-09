import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { messageForError } from '@/lib/api';
import { formatInt } from '@/lib/format';
import { readRsvpHint, setRsvp, writeRsvpHint } from './api';

export interface RSVPButtonProps {
  activityId: string;
  initialCount: number;
  /** When set, the button is disabled and this reason is shown. */
  disabledReason?: string | null;
}

const LOW_COUNT_THRESHOLD = 5;

/**
 * "Eu vou" without login (spec §3.5, §12.7). Success is only shown AFTER the
 * server confirms; the state change is announced in a polite live region.
 * It records an INTENTION, not attendance.
 */
export function RSVPButton({ activityId, initialCount, disabledReason }: RSVPButtonProps) {
  const [going, setGoing] = useState<boolean>(() => readRsvpHint(activityId));
  const [count, setCount] = useState(initialCount);
  const [announcement, setAnnouncement] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (next: boolean) => setRsvp(activityId, next),
    onMutate: () => {
      setError(null);
      setAnnouncement('');
    },
    onSuccess: (state) => {
      setGoing(state.going);
      setCount(state.rsvp_count_approx);
      writeRsvpHint(activityId, state.going);
      setAnnouncement(
        state.going
          ? 'Pronto: sua intenção de ir foi registrada.'
          : 'Sua intenção de ir foi removida.',
      );
    },
    onError: (err) => {
      setError(messageForError(err));
      setAnnouncement('Não foi possível atualizar sua intenção. Nada foi alterado.');
    },
  });

  const pending = mutation.isPending;
  const disabled = !!disabledReason;

  return (
    <div className="flex flex-col gap-3" aria-busy={pending || undefined}>
      {going ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="inline-flex items-center gap-2 font-semibold text-success">
            <Icon name="check" />
            Você marcou “Eu vou”
          </p>
          <Button
            variant="secondary"
            size="sm"
            iconBefore={<Icon name="undo" size={18} />}
            loading={pending}
            loadingText="Desfazendo…"
            disabled={disabled}
            onClick={() => mutation.mutate(false)}
          >
            Desfazer
          </Button>
        </div>
      ) : (
        <Button
          size="lg"
          className="w-full sm:w-auto"
          loading={pending}
          loadingText="Registrando…"
          disabled={disabled}
          onClick={() => mutation.mutate(true)}
        >
          Eu vou
        </Button>
      )}

      {disabledReason ? <p className="text-sm text-muted">{disabledReason}</p> : null}

      <p className="text-sm text-secondary">
        {count < LOW_COUNT_THRESHOLD
          ? 'Menos de 5 pessoas marcaram “Eu vou” até agora.'
          : `Cerca de ${formatInt(count)} pessoas marcaram “Eu vou”.`}
      </p>
      <p className="text-sm text-muted">
        “Eu vou” registra sua <strong>intenção</strong> de participar — não é inscrição nem
        confirmação de presença, e não exige login. A marcação fica associada a este navegador.
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-error/40 bg-error-soft p-3 text-sm text-primary"
        >
          {error}
        </p>
      ) : null}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}
