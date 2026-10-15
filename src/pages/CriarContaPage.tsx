import { useSearchParams } from 'react-router';
import { TerritoryId } from '@shared/contracts/territory.ts';
import { PageShell } from '@/components/layouts/PageShell';
import { safeRedirectPath } from '@/lib/auth';
import { AccountPanel } from '@/features/registration/AccountPanel';

/**
 * /criar-conta — ORGANIZER account (ADR 0005: e-mail code, no password). Needed only to propose
 * activities; the volunteer sign-up needs no account (D48). `?next=` is validated.
 */
export default function CriarContaPage() {
  const [sp] = useSearchParams();
  const raw = sp.get('territorio');
  const territory = raw && TerritoryId.safeParse(raw).success && raw !== 'mg' ? raw : null;
  const next = safeRedirectPath(sp.get('next'), '/criar-atividade');

  return (
    <PageShell
      title="Criar conta de organizador"
      lead="Para propor atividades da campanha no mapa. Confirmamos seu e-mail com um código de 6 números; não há senha. Para ser voluntário não é preciso conta."
    >
      <AccountPanel territoryId={territory} next={next} />
    </PageShell>
  );
}
