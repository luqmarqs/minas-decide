import { useEffect, useState } from 'react';

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Runs `cb` after the page `load` event and the next idle period (P-PERF-1): heavy
 * work (MapLibre, 2 MB territory index, agenda) starts only after the first paint
 * of the static content. `timeout` bounds the wait on busy main threads.
 * Returns a cancel function.
 */
export function whenIdle(
  cb: () => void,
  { timeout = 2000, idle: waitIdle = true }: { timeout?: number; idle?: boolean } = {},
): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as IdleWindow;
  let cancelled = false;
  let idleId: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let raf: number | undefined;
  const idle = () => {
    if (cancelled) return;
    if (typeof w.requestIdleCallback === 'function') {
      idleId = w.requestIdleCallback(() => !cancelled && cb(), { timeout });
    } else {
      timer = setTimeout(() => !cancelled && cb(), 1);
    }
  };
  // `load` can fire before the first frame is painted (small HTML, cached JS):
  // wait for two animation frames so the static content is on screen first.
  const schedule = () => {
    if (cancelled) return;
    if (typeof window.requestAnimationFrame !== 'function') return waitIdle ? idle() : cb();
    raf = window.requestAnimationFrame(() => {
      raf = window.requestAnimationFrame(() => {
        timer = setTimeout(waitIdle ? idle : () => !cancelled && cb(), 0);
      });
    });
  };
  // Gate: `load` AND the first contentful paint (or a 3 s safety net).
  let loaded = document.readyState === 'complete';
  let painted = hasContentfulPaint();
  let observer: PerformanceObserver | undefined;
  let safety: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  const maybeStart = () => {
    if (started || cancelled || !loaded || !painted) return;
    started = true;
    observer?.disconnect();
    if (safety !== undefined) clearTimeout(safety);
    schedule();
  };
  const onLoad = () => {
    loaded = true;
    maybeStart();
  };
  if (!painted) {
    try {
      observer = new PerformanceObserver((list) => {
        if (list.getEntries().some((e) => e.name === 'first-contentful-paint')) {
          painted = true;
          maybeStart();
        }
      });
      observer.observe({ type: 'paint', buffered: true });
    } catch {
      painted = true; // no Paint Timing API (tests, old browsers)
    }
    safety = setTimeout(() => {
      painted = true;
      maybeStart();
    }, 3000);
  }
  if (!loaded) window.addEventListener('load', onLoad, { once: true });
  maybeStart();
  return () => {
    cancelled = true;
    observer?.disconnect();
    if (safety !== undefined) clearTimeout(safety);
    window.removeEventListener('load', onLoad);
    if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
    if (raf !== undefined) window.cancelAnimationFrame?.(raf);
    if (timer !== undefined) clearTimeout(timer);
  };
}

function hasContentfulPaint(): boolean {
  try {
    if (typeof PerformanceObserver === 'undefined') return true;
    const types = PerformanceObserver.supportedEntryTypes ?? [];
    if (!types.includes('paint')) return true;
    return performance.getEntriesByName('first-contentful-paint').length > 0;
  } catch {
    return true;
  }
}

/**
 * `true` right after the first contentful frame (load + FCP + two frames), without
 * waiting for idle: for a page's own primary data, fetched only once the static
 * shell is on screen.
 */
export function useAfterFirstPaint(): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (done) return;
    return whenIdle(() => setDone(true), { idle: false });
  }, [done]);
  return done;
}

/** `true` once the page is idle after load, or immediately when `force` is set. */
export function useAfterIdle(force = false, timeout?: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (idle) return;
    return whenIdle(() => setIdle(true), { timeout });
  }, [idle, timeout]);
  return idle || force;
}
