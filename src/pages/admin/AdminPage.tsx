import { PageShell } from '@/components/layouts/PageShell';
import { Note } from '@/components/ui/States';

/** Admin entry — lazy chunk, never linked from public navigation. Placeholder this round. */
export default function AdminPage() {
  return (
    <PageShell title="Administração" documentTitle="Administração">
      <meta name="robots" content="noindex, nofollow" />
      <Note>Em construção nesta rodada. Acesso restrito a administradores com MFA.</Note>
    </PageShell>
  );
}
