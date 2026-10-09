import { useEffect, useRef, type RefObject } from 'react';

/**
 * Light-dismiss for non-modal map popovers (FE-10): a pointer press outside `ref` (and
 * outside `ignore`, e.g. the trigger button) or Esc with focus inside closes it. Esc is
 * handled in the window capture phase and stopped, so the territory sheet behind does not
 * close too. Focus is never trapped.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { enabled = true, ignore }: { enabled?: boolean; ignore?: RefObject<HTMLElement | null> } = {},
): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!enabled) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || ref.current?.contains(t) || ignore?.current?.contains(t)) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const inside =
        ref.current?.contains(document.activeElement) ||
        ignore?.current?.contains(document.activeElement);
      if (!inside) return;
      e.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [enabled, ref, ignore]);
}
