import { prefersReducedMotion } from '@/lib/media';

export const JOIN_SECTION_ID = 'participar';
export const JOIN_TITLE_ID = 'participar-titulo';

/**
 * Smoothly scrolls to the home sign-up section and moves focus to its heading (so keyboard
 * and screen-reader users land there too). Content above it (map, narrative, agenda) loads
 * lazily and may change height during the scroll, so the position is corrected once or twice
 * afterwards. Returns false when the section is not on the page.
 */
export function scrollToJoin(): boolean {
  const section = document.getElementById(JOIN_SECTION_ID);
  if (!section) return false;
  section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  document.getElementById(JOIN_TITLE_ID)?.focus({ preventScroll: true });
  if (window.location.hash !== `#${JOIN_SECTION_ID}`) {
    window.history.replaceState(window.history.state, '', `#${JOIN_SECTION_ID}`);
  }
  const header = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--header-height'),
  );
  const settle = () => {
    const top = section.getBoundingClientRect().top;
    if (Math.abs(top - (Number.isFinite(header) ? header : 0)) > 48) {
      section.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  };
  window.setTimeout(settle, 900);
  window.setTimeout(settle, 2200);
  return true;
}
