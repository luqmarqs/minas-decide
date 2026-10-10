import { afterEach, describe, expect, it } from 'vitest';
import { UMAMI_SCRIPT_ID, mountUmami, readUmamiConfig, umamiOrigin } from '@/lib/analytics';

const ID = '6f1d2c3b-4a5e-4f60-9b7c-8d9e0f1a2b3c';
const URL_ = 'https://analytics.example.org/script.js';

afterEach(() => {
  document.getElementById(UMAMI_SCRIPT_ID)?.remove();
});

describe('Umami config', () => {
  it('is disabled without both script URL and website id', () => {
    expect(readUmamiConfig({})).toBeNull();
    expect(readUmamiConfig({ VITE_UMAMI_SCRIPT_URL: URL_ })).toBeNull();
    expect(readUmamiConfig({ VITE_UMAMI_WEBSITE_ID: ID })).toBeNull();
  });

  it('rejects non-https URLs and malformed ids', () => {
    expect(
      readUmamiConfig({
        VITE_UMAMI_SCRIPT_URL: 'http://x.org/script.js',
        VITE_UMAMI_WEBSITE_ID: ID,
      }),
    ).toBeNull();
    expect(
      readUmamiConfig({ VITE_UMAMI_SCRIPT_URL: URL_, VITE_UMAMI_WEBSITE_ID: 'not-a-uuid' }),
    ).toBeNull();
  });

  it('normalises the optional domain list', () => {
    const cfg = readUmamiConfig({
      VITE_UMAMI_SCRIPT_URL: URL_,
      VITE_UMAMI_WEBSITE_ID: ID,
      VITE_UMAMI_DOMAINS: ' MinasDecide.com.br , www.minasdecide.com.br, bad host ',
    });
    expect(cfg).toEqual({
      scriptUrl: URL_,
      websiteId: ID,
      domains: 'minasdecide.com.br,www.minasdecide.com.br',
    });
  });

  it('derives the CSP origin from the script URL', () => {
    expect(umamiOrigin(URL_)).toBe('https://analytics.example.org');
    expect(umamiOrigin('http://analytics.example.org/script.js')).toBeNull();
    expect(umamiOrigin(undefined)).toBeNull();
  });
});

describe('mountUmami', () => {
  it('inserts a deferred, DNT-respecting tracker once', () => {
    const cfg = { scriptUrl: URL_, websiteId: ID, domains: 'minasdecide.com.br' };
    const s = mountUmami(cfg);
    expect(s?.src).toBe(URL_);
    expect(s?.defer).toBe(true);
    expect(s?.getAttribute('data-website-id')).toBe(ID);
    expect(s?.getAttribute('data-do-not-track')).toBe('true');
    expect(s?.getAttribute('data-domains')).toBe('minasdecide.com.br');
    expect(mountUmami(cfg)).toBeNull();
    expect(document.querySelectorAll(`#${UMAMI_SCRIPT_ID}`)).toHaveLength(1);
  });
});
