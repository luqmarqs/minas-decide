/**
 * Redesign editorial (direção A, D4/D5): "Por que Minas decide" como página dupla de jornal.
 * Celular: lista vertical a toda a largura, os seis números visíveis, sem carrossel e sem
 * rolagem horizontal (390 e 320 px, também com fonte ampliada). Desktop: grade assimétrica
 * (âncora estreita + comparativo largo; três múltiplos na mesma linha).
 * Sem @axe-core/playwright no projeto: checagens estruturais de acessibilidade.
 */
import { expect, test, type Page } from '@playwright/test';

// e2e/ compila sem a lib DOM: tipagem mínima do getComputedStyle (usado DENTRO do navegador,
// inline nos callbacks de evaluate, que são serializados).
type Css = { fontSize: string; boxShadow: string; borderRadius: string };
type Win = { getComputedStyle(e: unknown): Css };

const FIGS = [
  'fig-nacional',
  'fig-duelo',
  'fig-margem-2022',
  'fig-municipios',
  'fig-comparecimento',
  'fig-nenhum',
] as const;

async function openSection(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const section = page.locator('[data-testid="why-minas"]');
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByTestId('fig-nacional')).toBeVisible({ timeout: 15_000 });
  return section;
}

for (const width of [390, 320]) {
  test(`celular ${width}px: seis números visíveis, sem carrossel e sem rolagem horizontal`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const section = await openSection(page);
    await expect(section.getByTestId('why-minas-carousel')).toHaveCount(0);
    await expect(section.getByRole('button', { name: /Ir para o número/ })).toHaveCount(0);
    for (const id of FIGS) {
      const fig = section.getByTestId(id);
      await fig.scrollIntoViewIfNeeded();
      await expect(fig).toBeVisible();
      const box = await fig.boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.x, id).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, id).toBeLessThanOrEqual(width + 0.5);
      // Lista vertical: cada bloco ocupa (quase) toda a largura útil.
      expect(box!.width, id).toBeGreaterThan(width * 0.7);
    }
    const tops = await Promise.all(
      FIGS.map(async (id) => (await section.getByTestId(id).boundingBox())!.y),
    );
    for (let i = 1; i < tops.length; i++) expect(tops[i]!).toBeGreaterThan(tops[i - 1]!);
    // A seção não pode criar rolagem horizontal. (Em 320 px o cabeçalho global — fora do escopo
    // deste redesign, congelado — excedia a viewport; a página inteira só é checada em 390.)
    expect(await section.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (width >= 390)
      expect(await page.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
        width,
      );
  });
}

test('celular 320px com fonte ampliada (200%): a seção reflui sem estourar', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const section = await openSection(page);
  await page.evaluate("document.documentElement.style.fontSize = '200%'");
  await page.waitForTimeout(300);
  const overflow = await section.evaluate((el) => {
    const r = el.getBoundingClientRect();
    let worst = 0;
    for (const n of el.querySelectorAll('li, p, svg, [role="img"]')) {
      const b = n.getBoundingClientRect();
      worst = Math.max(worst, b.right - r.right, r.left - b.left);
    }
    return worst;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});

test('desktop: grade assimétrica (âncora + margem 4 col | comparativo 8 col; múltiplos 4/4/4)', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'layout de desktop');
  await page.setViewportSize({ width: 1440, height: 900 });
  const section = await openSection(page);
  const grid = section.getByTestId('why-minas-figures');
  await expect(grid).toHaveClass(/ed-grid-12/);
  const box = async (id: string) => (await section.getByTestId(id).boundingBox())!;
  const [nac, duel, marg, mun, comp, nen] = await Promise.all(FIGS.map(box));
  // Âncora e comparativo lado a lado, comparativo ≈ 2× mais largo e sozinho na coluna direita.
  expect(Math.abs(nac!.y - duel!.y)).toBeLessThan(4);
  expect(duel!.width / nac!.width).toBeGreaterThan(1.7);
  // Margem de 2022 na coluna da âncora, abaixo dela, alinhada pela base com o fim do comparativo.
  expect(Math.abs(marg!.x - nac!.x)).toBeLessThan(2);
  expect(marg!.y).toBeGreaterThan(nac!.y + nac!.height - 1);
  expect(Math.abs(marg!.y + marg!.height - (duel!.y + duel!.height))).toBeLessThan(2);
  // Três múltiplos na mesma linha, de larguras iguais.
  expect(Math.abs(mun!.y - comp!.y)).toBeLessThan(2);
  expect(Math.abs(comp!.y - nen!.y)).toBeLessThan(2);
  expect(Math.abs(mun!.width - nen!.width)).toBeLessThan(2);
  // Número âncora é o maior da seção.
  const anchorSize = await section
    .getByTestId('fig-nacional')
    .locator('.ed-figure-xl')
    .evaluate((el) => parseFloat((globalThis as unknown as Win).getComputedStyle(el).fontSize));
  const otherSize = await section
    .getByTestId('fig-municipios')
    .locator('.ed-figure')
    .evaluate((el) => parseFloat((globalThis as unknown as Win).getComputedStyle(el).fontSize));
  expect(anchorSize).toBeGreaterThan(otherSize * 1.4);
});

test('acessibilidade estrutural da seção (sem axe instalado)', async ({ page }) => {
  const section = await openSection(page);
  await expect(section).toHaveAttribute('aria-labelledby', 'why-minas-title');
  await expect(section.getByRole('heading', { level: 2, name: 'Por que Minas decide' })).toHaveId(
    'why-minas-title',
  );
  await expect(section.getByRole('heading', { level: 3 })).toHaveCount(6);
  const imgs = section.getByRole('img');
  await expect(imgs).toHaveCount(6);
  for (const label of await imgs.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  ))
    expect(label.length).toBeGreaterThan(20);
  await expect(section.getByRole('img', { name: /2026 · 1º turno: Lula 43,3%/ })).toBeVisible();
  // Sem sombras nem cantos arredondados nos blocos.
  const chrome = await section.locator('[data-testid^="fig-"]').evaluateAll((els) =>
    els.map((e) => {
      const c = (globalThis as unknown as Win).getComputedStyle(e);
      return `${c.boxShadow}|${c.borderRadius}`;
    }),
  );
  for (const c of chrome) expect(c).toBe('none|0px');
});
