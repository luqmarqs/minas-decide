import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { signOut, useMe, type AuthSession } from '@/lib/auth';

/**
 * Account menu for a signed-in person (Clerk session = verified e-mail). Shows the name,
 * "Minhas atividades", "Moderação" (only when GET /me says is_admin) and "Sair".
 * Never renders e-mail/phone in the header.
 */
export function SessionMenuActive({ session }: { session: AuthSession }) {
  const me = useMe(session);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const label = me.data?.display_name ?? session.user.firstName ?? 'Minha conta';

  async function handleSignOut() {
    setOpen(false);
    await signOut();
  }

  const item = 'flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-surface-alt';

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        className="touch-target inline-flex items-center gap-2 rounded-pill border border-border bg-surface-raised px-3 text-sm text-primary hover:bg-surface-alt focus-visible:outline-none"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true" className="size-2 rounded-pill bg-success" />
        <span className="max-w-24 truncate sm:max-w-36">{label}</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Conta"
          className="absolute right-0 mt-2 w-56 rounded-card border border-border bg-surface-raised p-1 shadow-raised"
        >
          <Link
            role="menuitem"
            to="/minhas-atividades"
            className={item}
            onClick={() => setOpen(false)}
          >
            Minhas atividades
          </Link>
          <Link
            role="menuitem"
            to="/criar-atividade"
            className={item}
            onClick={() => setOpen(false)}
          >
            Propor atividade
          </Link>
          {me.data?.is_admin ? (
            <Link role="menuitem" to="/admin" className={item} onClick={() => setOpen(false)}>
              Moderação
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={`${item} w-full text-left`}
            onClick={() => void handleSignOut()}
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
