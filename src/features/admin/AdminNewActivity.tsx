import { useRef, useState } from 'react';
import type { MyActivity } from '@shared/contracts/activities.ts';
import { Button, ButtonLink } from '@/components/ui/Button';
import { idempotencyKey } from '@/lib/api';
import { formatActivityWhen } from '@/lib/format';
import { ActivityEditor } from '@/features/activities/ActivityEditor';
import { createAdminActivity } from './api';

/**
 * D50: "Nova atividade" in the admin panel. Same editor (fields, map, validation) as the
 * organizer form; the activity is PUBLISHED at once by POST /admin/activities (server checks
 * admin, audits `admin.activity.create`). Draft kept like the organizer form (own slot). One
 * idempotency key per form: a retry after a network
 * error never creates a second activity; a new key only after "Criar outra".
 */
export function AdminNewActivity({ adminId }: { adminId: string }) {
  const key = useRef(idempotencyKey());
  const [round, setRound] = useState(0);
  const [saved, setSaved] = useState<MyActivity | null>(null);

  if (saved) {
    return (
      <section
        role="status"
        aria-labelledby="adm-act-sent"
        className="flex flex-col gap-3 rounded-md border border-success/40 bg-success-soft p-4"
      >
        <h2 id="adm-act-sent" className="font-body text-xl font-semibold tracking-normal">
          Atividade publicada
        </h2>
        <p>
          “{saved.title}” — {formatActivityWhen(saved.starts_at, saved.ends_at)}. Já aparece no mapa
          e na agenda.
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={`/atividade/${saved.id}`}>Ver atividade</ButtonLink>
          <Button
            variant="secondary"
            onClick={() => {
              key.current = idempotencyKey();
              setSaved(null);
              setRound((r) => r + 1);
            }}
          >
            Criar outra
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-secondary">
        Atividades criadas aqui são publicadas na hora, sem passar pela fila de revisão, e ficam
        registradas na auditoria.
      </p>
      <ActivityEditor
        key={round}
        mode="create"
        // Separate draft slot from the admin's own organizer form (cleared on sign-out too).
        draftOwner={`admin-${adminId}`}
        createLabel="Publicar atividade"
        submitCreate={(input) => {
          const { turnstile_token: _drop, ...rest } = input;
          void _drop;
          return createAdminActivity({ ...rest, idempotency_key: key.current });
        }}
        onSaved={setSaved}
      />
    </div>
  );
}
