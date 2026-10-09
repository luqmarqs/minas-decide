import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrandLockup } from '@/components/brand/BrandLockup';
import { SunMark } from '@/components/brand/SunMark';
import { SUN_PATH, sunSvgDocument } from '@/components/brand/sunGeometry';
import { AppHeader } from '@/components/layouts/AppHeader';
import { ActivityMarker } from '@/features/activities/ActivityMarker';
import {
  applyBrand,
  BRAND_FAVICON,
  BRAND_ID,
  BRAND_STORAGE_KEY,
  initBrand,
  PROVISIONAL_FAVICON,
  PROVISIONAL_ID,
  resolveBrand,
} from '@/lib/brand';
import { renderWithApp, stubFetch } from './utils';

function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    map: m,
  };
}

function resetDom() {
  delete document.documentElement.dataset.brand;
  window.localStorage.removeItem(BRAND_STORAGE_KEY);
  window.history.replaceState(null, '', '/');
}

describe('identidade — ativação (oficial é o padrão)', () => {
  beforeEach(resetDom);
  afterEach(resetDom);

  it('padrão: sem query nem storage, a identidade oficial fica ativa', () => {
    expect(resolveBrand('', memoryStorage())).toBe(BRAND_ID);
  });

  it('?brand=0 ativa o provisório e persiste mm.brand=provisorio', () => {
    const s = memoryStorage();
    expect(resolveBrand('?brand=0', s)).toBe(PROVISIONAL_ID);
    expect(s.map.get(BRAND_STORAGE_KEY)).toBe(PROVISIONAL_ID);
    expect(resolveBrand('?brand=provisorio', memoryStorage())).toBe(PROVISIONAL_ID);
  });

  it('localStorage mm.brand=provisorio mantém o rollback sem query', () => {
    expect(resolveBrand('?x=1', memoryStorage({ [BRAND_STORAGE_KEY]: PROVISIONAL_ID }))).toBe(
      PROVISIONAL_ID,
    );
    expect(resolveBrand('', memoryStorage({ [BRAND_STORAGE_KEY]: 'outra' }))).toBe(BRAND_ID);
  });

  it('?brand=1 volta ao oficial e limpa o storage', () => {
    const s = memoryStorage({ [BRAND_STORAGE_KEY]: PROVISIONAL_ID });
    expect(resolveBrand('?brand=1', s)).toBe(BRAND_ID);
    expect(s.map.has(BRAND_STORAGE_KEY)).toBe(false);
  });

  it('storage bloqueado: a query ainda funciona e o padrão é o oficial', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(resolveBrand('?brand=0', throwing)).toBe(PROVISIONAL_ID);
    expect(resolveBrand('', throwing)).toBe(BRAND_ID);
  });

  it('initBrand aplica data-brand e o favicon; ?brand=0 / ?brand=1 alternam', () => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = '/favicon.svg';
    document.head.appendChild(link);
    try {
      initBrand();
      expect(document.documentElement.dataset.brand).toBe(BRAND_ID);
      expect(link.getAttribute('href')).toBe(BRAND_FAVICON);

      window.history.replaceState(null, '', '/?brand=0');
      initBrand();
      expect(document.documentElement.dataset.brand).toBe(PROVISIONAL_ID);
      expect(link.getAttribute('href')).toBe(PROVISIONAL_FAVICON);
      expect(window.localStorage.getItem(BRAND_STORAGE_KEY)).toBe(PROVISIONAL_ID);

      window.history.replaceState(null, '', '/territorio/mg');
      initBrand(); // persisted rollback
      expect(document.documentElement.dataset.brand).toBe(PROVISIONAL_ID);

      window.history.replaceState(null, '', '/?brand=1');
      initBrand();
      expect(document.documentElement.dataset.brand).toBe(BRAND_ID);
      expect(link.getAttribute('href')).toBe(BRAND_FAVICON);
      expect(window.localStorage.getItem(BRAND_STORAGE_KEY)).toBeNull();
    } finally {
      link.remove();
    }
  });
});

describe('SunMark / lockup', () => {
  it('renderiza um SVG decorativo com currentColor e viewBox limpo', () => {
    const { container } = render(<SunMark size={40} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveAttribute('viewBox', '0 0 100 54');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe(SUN_PATH);
  });

  it('o caminho tem o semicírculo + 11 raios (12 subcaminhos fechados)', () => {
    expect(SUN_PATH.match(/M/g)).toHaveLength(12);
    expect(SUN_PATH.match(/Z/g)).toHaveLength(12);
    expect(sunSvgDocument('#e8ba1f')).toContain('viewBox="0 0 100 100"');
  });

  it('lockup com rótulo expõe nome acessível "Minas Decide"', () => {
    render(<BrandLockup label="Minas Decide" />);
    expect(screen.getByRole('img', { name: 'Minas Decide' })).toBeInTheDocument();
  });
});

describe('AppHeader e marcador: oficial × provisório', () => {
  beforeEach(() => {
    resetDom();
    stubFetch();
  });
  afterEach(resetDom);

  it('padrão: lockup oficial com nome acessível "Minas Decide"', () => {
    const { container } = renderWithApp(<AppHeader />);
    const link = screen.getByRole('link', { name: 'Minas Decide — página inicial' });
    expect(link.querySelector('.brand-lockup')).not.toBeNull();
    expect(container.querySelector('.brand-lockup svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('rollback provisório: sem lockup, wordmark textual "Minas Decide"', () => {
    applyBrand(PROVISIONAL_ID);
    const { container } = renderWithApp(<AppHeader />);
    expect(screen.getByRole('link', { name: 'Minas Decide — página inicial' })).toBeInTheDocument();
    expect(container.querySelector('.brand-lockup')).toBeNull();
    expect(screen.getByText('Minas Decide')).toBeInTheDocument();
  });

  it('reage à troca do atributo em tempo de execução', async () => {
    applyBrand(PROVISIONAL_ID);
    const { container } = renderWithApp(<AppHeader />);
    expect(container.querySelector('.brand-lockup')).toBeNull();
    await act(async () => {
      applyBrand(BRAND_ID);
      await Promise.resolve();
    });
    expect(container.querySelector('.brand-lockup')).not.toBeNull();
  });

  it('ActivityMarker usa o sol por padrão e o ponto só no provisório', () => {
    applyBrand(PROVISIONAL_ID);
    const { container, rerender } = render(<ActivityMarker label="Atividade" />);
    expect(container.querySelector('svg')).toBeNull();
    applyBrand(BRAND_ID);
    rerender(<ActivityMarker label="Atividade" key="b" />);
    expect(container.querySelector('[data-brand-marker] svg')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Atividade' })).toBeInTheDocument();
  });
});
