import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/media';
import { activeIndexFor, edgeFadeMask, useScrollEdges } from './scrollHints';

const HINT_KEY = 'mm-carousel-hint-seen';

function hintSeen(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}
function markHintSeen(): void {
  try {
    window.localStorage.setItem(HINT_KEY, '1');
  } catch {
    // storage blocked: the hint simply shows again next visit
  }
}

export interface CarouselProps {
  /** Accessible name of the list. */
  label: string;
  /** `<li>` items. */
  children: ReactNode;
  /** Extra classes of the `<ul>` (grid layout from `md`, item widths…). */
  className?: string;
  testId?: string;
  /** Accessible noun of one item, e.g. "número" → "Ir para o número 2 de 6". */
  itemNoun?: string;
}

/**
 * Horizontal snap carousel on phones that *signals* it scrolls (FE-10, owner request):
 * the next item peeks at the right edge, the edge with more content fades, position dots
 * below (buttons with `aria-current`, updated on scroll), ‹ › arrows at the edges that
 * scroll one item (≥ 44 px targets), and a "deslize para ver mais →" hint on the first
 * visit that disappears after the first scroll. Native scrollbar hidden; scroll-snap kept.
 * From `md` the `<ul>` is a grid (classes from the caller) and the controls are hidden.
 */
export function Carousel({ label, children, className, testId, itemNoun = 'item' }: CarouselProps) {
  const items = Children.toArray(children);
  const n = items.length;
  const ref = useRef<HTMLUListElement>(null);
  const edges = useScrollEdges(ref);
  const [active, setActive] = useState(0);
  const [hint, setHint] = useState(() => !hintSeen());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const offsets = [...el.children].map((c) => (c as HTMLElement).offsetLeft);
        setActive(activeIndexFor(el.scrollLeft, offsets, el.scrollWidth - el.clientWidth));
        if (el.scrollLeft > 8) {
          setHint((h) => {
            if (h) markHintSeen();
            return false;
          });
        }
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  const go = (i: number) => {
    const el = ref.current;
    const target = el?.children[Math.max(0, Math.min(n - 1, i))] as HTMLElement | undefined;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !target || !first) return;
    el.scrollTo({
      left: target.offsetLeft - first.offsetLeft,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  const fade = edgeFadeMask(edges);
  const arrow = 'absolute top-1/2 z-[1] grid size-11 -translate-y-1/2 place-items-center md:hidden';
  const arrowFace =
    'grid size-8 place-items-center rounded-pill border border-border-strong bg-surface-raised/95 text-primary shadow-raised';

  return (
    <div className="relative" data-testid={testId}>
      <div className="relative">
        <ul
          ref={ref}
          aria-label={label}
          tabIndex={0}
          style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
          className={cn(
            '-mx-(--gutter) flex snap-x snap-mandatory scroll-px-(--gutter) gap-2 overflow-x-auto px-(--gutter) pb-1',
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            'md:mx-0 md:overflow-visible md:px-0 md:pb-0 md:[mask-image:none]',
            className,
          )}
        >
          {children}
        </ul>
        {edges.scrollable && !edges.atStart ? (
          <button
            type="button"
            className={cn(arrow, '-left-3')}
            aria-label={`Ver ${itemNoun} anterior`}
            onClick={() => go(active - 1)}
          >
            <span className={arrowFace}>
              <Icon name="chevronLeft" size={18} />
            </span>
          </button>
        ) : null}
        {edges.scrollable && !edges.atEnd ? (
          <button
            type="button"
            className={cn(arrow, '-right-3')}
            aria-label={`Ver próximo ${itemNoun}`}
            onClick={() => go(active + 1)}
          >
            <span className={arrowFace}>
              <Icon name="chevronRight" size={18} />
            </span>
          </button>
        ) : null}
      </div>
      {n > 1 ? (
        <div className="flex items-center justify-between gap-2 md:hidden">
          <ol
            className="flex items-center"
            aria-label={`Posição: ${itemNoun} ${active + 1} de ${n}`}
            data-testid="carousel-dots"
          >
            {items.map((_, i) => (
              <li key={i}>
                <button
                  type="button"
                  aria-label={`Ir para o ${itemNoun} ${i + 1} de ${n}`}
                  aria-current={i === active ? 'true' : undefined}
                  onClick={() => go(i)}
                  className="grid h-11 w-7 place-items-center"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'block h-2 rounded-pill transition-[width,background-color] duration-(--duration-fast)',
                      i === active ? 'w-5 bg-action' : 'w-2 bg-border-strong',
                    )}
                  />
                </button>
              </li>
            ))}
          </ol>
          {hint ? (
            <p className="text-xs text-secondary" data-testid="carousel-hint">
              Deslize para ver mais →
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
