import { useSearchParams } from 'react-router';
import { TerritoryId } from '@shared/contracts/territory.ts';
import { PageShell } from '@/components/layouts/PageShell';
import { RegistrationForm } from '@/features/registration/RegistrationForm';

export default function ParticiparPage() {
  const [sp] = useSearchParams();
  const raw = sp.get('territorio');
  const territory = raw && TerritoryId.safeParse(raw).success && raw !== 'mg' ? raw : null;

  return (
    <PageShell
      title="Participar da campanha"
      lead="Faça parte da campanha de Lula em Minas Gerais. Cadastro rápido, sem criar conta: nome, e-mail, WhatsApp e território; depois mostramos o grupo da campanha na sua região."
    >
      <RegistrationForm initialTerritoryId={territory} />
    </PageShell>
  );
}
