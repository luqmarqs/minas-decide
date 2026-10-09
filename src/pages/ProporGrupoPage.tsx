import { useSearchParams } from 'react-router';
import { TerritoryId } from '@shared/contracts/territory.ts';
import { PageShell } from '@/components/layouts/PageShell';
import { GroupProposalForm } from '@/features/whatsapp-groups/GroupProposalForm';

export default function ProporGrupoPage() {
  const [sp] = useSearchParams();
  const raw = sp.get('territorio');
  const territory = raw && TerritoryId.safeParse(raw).success && raw !== 'mg' ? raw : null;
  return (
    <PageShell
      title="Propor um grupo"
      lead="Indique um grupo de WhatsApp para uma cidade ou bairro. Ele passa por revisão e só aparece no site se for aprovado."
    >
      <GroupProposalForm initialTerritoryId={territory} />
    </PageShell>
  );
}
