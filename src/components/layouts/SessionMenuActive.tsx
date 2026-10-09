import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { signOut, useMe, useSession } from '@/lib/auth';

/**
 * Header slot: shows the current session state (provisional vs. verified) with a
 * minimal menu. Falls back to the "Participar" CTA when there is no session.
 * Never renders e-mail/phone; the API already returns them masked.
 */
export function SessionMenuActive({ fallback }: { fallback: ReactNode }) {
  const session = useSession();
  const me = useMe(session.session);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (session.status !== 'active' || !me.data) return <>{fallback}</>;

  const label = me.data.email_verified
    ? (me.data.display_name ?? 'Conta verificada')
    : 'Sessão provisória';

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate('/');
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="touch-target inline-flex items-center gap-2 rounded-pill border border-border bg-surface-raised px-3 text-sm text-primary hover:bg-surface-alt focus-visible:outline-none"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          aria-hidden="true"
          className={
            me.data.email_verified
              ? 'size-2 rounded-pill bg-success'
              : 'size-2 rounded-pill bg-warning'
          }
        />
        <span className="max-w-36 truncate">{label}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-card border border-border bg-surface-raised p-1 shadow-raised"
        >
          {!me.data.email_verified && (
            <p className="px-3 py-2 text-xs text-muted">
              Verifique seu e-mail para propor atividades.
            </p>
          )}
          <Link
            role="menuitem"
            to="/minhas-atividades"
            className="flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-surface-alt"
            onClick={() => setOpen(false)}
          >
            Minhas atividades
          </Link>
          {me.data.email_verified && (
            <Link
              role="menuitem"
              to="/conta/seguranca"
              className="flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-surface-alt"
              onClick={() => setOpen(false)}
            >
              Segurança da conta
            </Link>
          )}
          {me.data.is_admin && (
            <Link
              role="menuitem"
              to="/admin"
              className="flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-surface-alt"
              onClick={() => setOpen(false)}
            >
              Moderação
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-surface-alt"
            onClick={() => void handleSignOut()}
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
