import { Drawer } from 'vaul';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export type SnapPoint = number | string;

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Optional subtitle rendered under the title (also used as accessible description). */
  description?: ReactNode;
  children: ReactNode;
  /** collapsed / half / expanded (spec §12.4). */
  snapPoints?: SnapPoint[];
  activeSnapPoint?: SnapPoint | null;
  onActiveSnapPointChange?: (snap: SnapPoint | null) => void;
  /** Non-modal by default so the map remains usable behind the sheet. */
  modal?: boolean;
  headerExtra?: ReactNode;
}

/**
 * Mobile bottom sheet built on vaul (accessible drawer on top of Radix Dialog).
 * Non-modal: does not trap focus nor block the map; Esc and the close button
 * dismiss it. Motion duration follows --duration-sheet (0 with reduced motion).
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  snapPoints = ['148px', 0.45, 0.92],
  activeSnapPoint,
  onActiveSnapPointChange,
  modal = false,
  headerExtra,
}: BottomSheetProps) {
  useKeepPageAccessible(open && !modal);
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={snapPoints}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={onActiveSnapPointChange}
      modal={modal}
      noBodyStyles
    >
      <Drawer.Portal>
        <Drawer.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-(--z-sheet) flex h-full max-h-[94dvh] flex-col',
            'rounded-t-sheet border border-b-0 border-border bg-surface-raised text-primary shadow-sheet outline-none',
          )}
        >
          <div className="flex shrink-0 flex-col px-4 pt-2 pb-2">
            <Drawer.Handle
              className="mx-auto mb-2 !h-1.5 !w-12 !rounded-pill !bg-border-strong"
              aria-hidden="true"
            />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Drawer.Title className="truncate font-display text-xl">{title}</Drawer.Title>
                {description ? (
                  <Drawer.Description className="text-sm text-muted">
                    {description}
                  </Drawer.Description>
                ) : (
                  <Drawer.Description className="sr-only">
                    Painel do território selecionado
                  </Drawer.Description>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {headerExtra}
                <Drawer.Close
                  className="grid size-11 place-items-center rounded-md text-secondary hover:bg-surface-alt"
                  aria-label="Fechar painel"
                >
                  <Icon name="close" />
                </Drawer.Close>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(var(--space-6)+var(--safe-bottom))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * vaul always renders a *modal* Radix Dialog underneath (its modal prop only changes
 * vaul's own behaviour), so Radix hides the rest of the page from assistive technology with
 * aria-hidden (data-aria-hidden markers). For our non-modal sheet the map, its layer
 * controls and the activity popover must stay reachable: undo those markers outside the
 * drawer while it is open (rodada 3 finding; Radix restores nothing else on close).
 */
function useKeepPageAccessible(active: boolean) {
  useEffect(() => {
    if (!active || typeof MutationObserver === 'undefined') return;
    const reveal = () => {
      for (const el of document.querySelectorAll('[data-aria-hidden]')) {
        if (el.closest('[data-vaul-drawer]')) continue;
        el.removeAttribute('aria-hidden');
        el.removeAttribute('data-aria-hidden');
      }
    };
    reveal();
    const mo = new MutationObserver(reveal);
    mo.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-aria-hidden'],
    });
    return () => mo.disconnect();
  }, [active]);
}
