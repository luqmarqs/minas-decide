/**
 * HERO CONGELADO (redesign editorial, 2026-10-09): o hero aprovado (`section.brand-hero`) não
 * pode mudar nem indiretamente (tokens, wrappers, tipografia, breakpoints). Este teste compara a
 * região do hero com as imagens de referência geradas ANTES do redesign, em 4 viewports × 2 temas.
 * Regenerar só com autorização explícita do proprietário: `npx playwright test e2e/hero-freeze
 * --update-snapshots`.
 */
import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'm390', width: 390, height: 844 },
  { name: 't768', width: 768, height: 1024 },
  { name: 'l1024', width: 1024, height: 768 },
  { name: 'd1440', width: 1440, height: 900 },
] as const;
const THEMES = ['light', 'dark'] as const;

test.describe('hero congelado', () => {
  // One browser project is enough: the viewport is set per case below.
  test.skip(({ isMobile }) => isMobile, 'viewports são definidos no próprio teste');

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`hero idêntico em ${vp.name} / ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto('/');
        await page.waitForFunction('document.fonts.status === "loaded"', undefined, {
          timeout: 10_000,
        });
        const hero = page.locator('section.brand-hero');
        await expect(hero).toBeVisible();
        // Let the hero image settle (it is preloaded; srcset may still swap once).
        await page.waitForTimeout(800);
        await expect(hero).toHaveScreenshot(`hero-${vp.name}-${theme}.png`, {
          animations: 'disabled',
          maxDiffPixelRatio: 0.002,
        });
      });
    }
  }
});
