import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { clerk } from './clerkFake';

// ADR 0005: Clerk is always "configured" in unit tests (deterministic, independent of a
// developer's .env.local) and replaced by an in-memory fake — no network, no clerk-js.
vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_ZmFrZS1pbnN0YW5jZS5jbGVyay5hY2NvdW50cy5kZXYk');
vi.mock('@clerk/clerk-react', async () => (await import('./clerkFake')).clerkReactMock);

beforeEach(() => {
  clerk.reset();
});

// CI runners are slow: form flows load lazy chunks (Zod, Turnstile) before submitting.
// 1 s (default) flakes on GitHub Actions; 8 s keeps assertions meaningful.
configure({ asyncUtilTimeout: 8000 });

afterEach(() => {
  cleanup();
});

// jsdom lacks matchMedia; components subscribe to media queries.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
}

if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
