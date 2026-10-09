import { createContext, useContext } from 'react';

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastApi {
  show: (t: { title: string; description?: string; variant?: ToastVariant }) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  // Outside the provider (tests), toasts are a no-op rather than a crash.
  return ctx ?? { show: () => {} };
}
