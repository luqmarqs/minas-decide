import * as RadixToast from '@radix-ui/react-toast';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';
import { ToastContext, type ToastApi, type ToastVariant } from './toastContext';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

const variantClasses: Record<ToastVariant, string> = {
  info: 'border-border-strong',
  success: 'border-success',
  error: 'border-error',
};

/** Discreet notifications (Radix Toast = polite live region; errors use foreground type). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback<ToastApi['show']>(({ title, description, variant = 'info' }) => {
    setItems((prev) => [
      ...prev.slice(-2),
      { id: Date.now() + Math.random(), title, description, variant },
    ]);
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      <RadixToast.Provider swipeDirection="down" duration={5000} label="Notificação">
        {children}
        {items.map((t) => (
          <RadixToast.Root
            key={t.id}
            type={t.variant === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => {
              if (!open) setItems((prev) => prev.filter((x) => x.id !== t.id));
            }}
            className={cn(
              'flex items-start gap-3 rounded-md border-l-4 bg-surface-raised p-4 text-primary shadow-raised',
              variantClasses[t.variant],
            )}
          >
            <div className="min-w-0 flex-1">
              <RadixToast.Title className="font-semibold">{t.title}</RadixToast.Title>
              {t.description ? (
                <RadixToast.Description className="text-sm text-secondary">
                  {t.description}
                </RadixToast.Description>
              ) : null}
            </div>
            <RadixToast.Close
              className="-m-2 grid size-11 place-items-center rounded-md text-secondary hover:bg-surface-alt"
              aria-label="Fechar notificação"
            >
              <Icon name="close" size={18} />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed right-0 bottom-0 z-(--z-toast) flex w-full max-w-sm flex-col gap-2 p-4 pb-[calc(var(--space-4)+var(--safe-bottom))] outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
