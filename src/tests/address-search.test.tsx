/**
 * D53: address search in the activity editor. fetch is stubbed: neither Google nor Photon (nor
 * the Worker) is ever reached. MapLibre is replaced by a probe that exposes the props it gets.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGoogleMapsCoords, googleMapsLinkKind } from '@shared/schemas/google-maps.ts';
import { ActivityEditor } from '@/features/activities/ActivityEditor';
import { matchTerritory } from '@/features/activities/geocodeTerritory';
import { buildDemoSnapshot } from '@/fixtures/electoral/demo';
import { buildTerritoryIndex } from '@/features/electoral-map/hooks';
import { jsonResponse, renderWithApp, stubFetch } from './utils';

vi.mock('@/features/activities/ActivityEditorMap', () => ({
  default: (p: { value: [number, number] | null; focusKey: number }) => (
    <div data-testid="map-probe">
      {p.value ? `pin:${p.value[0]},${p.value[1]}` : 'no-pin'} focus:{p.focusKey}
    </div>
  ),
}));

const env = (data: unknown) => jsonResponse({ data, meta: { request_id: 'r1' } });
const apiError = (code: string, message: string, status: number) =>
  jsonResponse({ error: { code, message }, meta: { request_id: 'r1' } }, status);

// "Vale Demo" / "Jardim Exemplo" exist in the demo snapshot used when no manifest is served.
const VALE_PLACE = {
  label: 'Rua Exemplo, 100, Jardim Exemplo, Vale Demo',
  street: 'Rua Exemplo',
  number: '100',
  neighborhood: 'Jardim Exemplo',
  city: 'Vale Demo',
  coordinates: [-47.45, -18.38] as [number, number],
};

function renderEditor() {
  return renderWithApp(<ActivityEditor mode="create" onSaved={() => {}} />);
}

const calls = (fn: ReturnType<typeof stubFetch>, part: string) =>
  fn.mock.calls.map((c) => String(c[0])).filter((u) => u.includes(part));

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('Google Maps link parsing (shared)', () => {
  it('extracts [lon, lat] from the supported forms', () => {
    expect(parseGoogleMapsCoords('https://www.google.com/maps/@-19.9191,-43.9386,15z')).toEqual([
      -43.9386, -19.9191,
    ]);
    // the place pin (!3d!4d) wins over the viewport center (@)
    expect(
      parseGoogleMapsCoords(
        'https://www.google.com/maps/place/X/@-19.9,-43.9,17z/data=!3m1!4b1!4m6!3m5!1s0x0!8m2!3d-19.9322!4d-43.9384',
      ),
    ).toEqual([-43.9384, -19.9322]);
    expect(parseGoogleMapsCoords('https://maps.google.com/?q=-19.9191,-43.9386')).toEqual([
      -43.9386, -19.9191,
    ]);
    expect(
      parseGoogleMapsCoords('https://www.google.com/maps?ll=-19.9191%2C-43.9386&z=14'),
    ).toEqual([-43.9386, -19.9191]);
    expect(parseGoogleMapsCoords('https://www.google.com/maps/@91,-43.9,15z')).toBeNull();
    expect(parseGoogleMapsCoords('Rua Sete de Setembro, 10')).toBeNull();
  });

  it('only allowlisted hosts count as Google Maps links', () => {
    expect(googleMapsLinkKind('https://maps.app.goo.gl/abc')).toBe('short');
    expect(googleMapsLinkKind('https://goo.gl/maps/abc')).toBe('short');
    expect(googleMapsLinkKind('https://www.google.com/maps/place/x')).toBe('full');
    expect(googleMapsLinkKind('https://www.google.com/search?q=x')).toBeNull();
    expect(googleMapsLinkKind('https://evil.example/maps/@-19,-43,1z')).toBeNull();
    expect(googleMapsLinkKind('http://www.google.com/maps')).toBeNull();
  });
});

describe('matchTerritory', () => {
  const index = buildTerritoryIndex(buildDemoSnapshot().index);
  it('matches city and neighborhood ignoring accents/case; falls back to the city', () => {
    expect(matchTerritory(index, 'vale demo', 'JARDIM EXEMPLO')?.id).toBe(
      'mg-3100104-jardim-exemplo',
    );
    expect(matchTerritory(index, 'Vale Demo', 'Bairro Desconhecido')?.id).toBe('mg-3100104');
    expect(matchTerritory(index, 'Ribeirão Fictício', null)?.id).toBe('mg-3112901');
    expect(matchTerritory(index, 'Cidade Inexistente', 'Centro')).toBeNull();
    expect(matchTerritory(index, null, null)).toBeNull();
  });
});

describe('address autocomplete', () => {
  it('debounces, needs 3 characters, and selecting fills address, point, map and territory', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch((url) =>
      url.startsWith('/api/v1/geocode?')
        ? Promise.resolve(
            env({
              provider: 'photon',
              items: [
                {
                  id: 'osm-N1',
                  label: 'Rua Exemplo',
                  secondary: 'Jardim Exemplo, Vale Demo',
                  place: VALE_PLACE,
                },
              ],
            }),
          )
        : undefined,
    );
    renderEditor();
    const input = screen.getByRole('combobox', { name: /Endereço ou ponto de encontro/ });
    await user.type(input, 'ru');
    await new Promise((r) => setTimeout(r, 450));
    expect(calls(fetchMock, '/api/v1/geocode?')).toHaveLength(0);

    await user.type(input, 'a exemplo');
    const option = await screen.findByRole('option', { name: /Rua Exemplo/ });
    // one request for the final text, not one per keystroke
    expect(calls(fetchMock, '/api/v1/geocode?')).toHaveLength(1);
    expect(calls(fetchMock, '/api/v1/geocode?')[0]).toContain('q=rua+exemplo');
    expect(screen.getByText('Busca de endereços © OpenStreetMap (Photon)')).toBeInTheDocument();

    await user.click(option);
    expect(input).toHaveValue(VALE_PLACE.label);
    expect(await screen.findByTestId('map-probe')).toHaveTextContent('pin:-47.45,-18.38 focus:1');
    expect(
      screen.getByRole('checkbox', { name: /Confirmo que o ponto \(-18\.38000, -47\.45000\)/ }),
    ).not.toBeChecked();
    expect(await screen.findByText(/Jardim Exemplo — Vale Demo\/MG/)).toBeInTheDocument();
    // selecting does not trigger another search for the filled text
    await new Promise((r) => setTimeout(r, 450));
    expect(calls(fetchMock, '/api/v1/geocode?')).toHaveLength(1);
  });

  it('Google suggestions load the place details on selection and show the Google attribution', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch((url) => {
      if (url.startsWith('/api/v1/geocode/place?'))
        return Promise.resolve(env({ provider: 'google', place: VALE_PLACE }));
      if (url.startsWith('/api/v1/geocode?'))
        return Promise.resolve(
          env({
            provider: 'google',
            items: [
              {
                id: 'ChIJabcdefghijk123',
                label: 'Praça Demo',
                secondary: 'Vale Demo - MG',
                place: null,
              },
            ],
          }),
        );
      return undefined;
    });
    renderEditor();
    const input = screen.getByRole('combobox', { name: /Endereço ou ponto de encontro/ });
    await user.type(input, 'praca demo');
    await user.click(await screen.findByRole('option', { name: /Praça Demo/ }));
    await waitFor(() => expect(input).toHaveValue(VALE_PLACE.label));
    const detail = calls(fetchMock, '/api/v1/geocode/place?')[0]!;
    expect(detail).toContain('id=ChIJabcdefghijk123');
    // the same session token goes to autocomplete and details
    const sessionOf = (u: string) => new URL(u, 'http://x').searchParams.get('session');
    expect(sessionOf(detail)).toBe(sessionOf(calls(fetchMock, '/api/v1/geocode?')[0]!));
    expect(screen.getByText('Powered by Google')).toBeInTheDocument();
    expect(await screen.findByTestId('map-probe')).toHaveTextContent('pin:-47.45,-18.38');
  });

  it('search outage: generic message, free typing still works', async () => {
    const user = userEvent.setup();
    stubFetch((url) =>
      url.startsWith('/api/v1/geocode?')
        ? Promise.resolve(
            apiError('SERVICE_UNAVAILABLE', 'Busca de endereços indisponível no momento.', 503),
          )
        : undefined,
    );
    renderEditor();
    const input = screen.getByRole('combobox', { name: /Endereço ou ponto de encontro/ });
    await user.type(input, 'praca demo');
    expect(await screen.findByText(/Você pode digitar o endereço manualmente/)).toBeInTheDocument();
    expect(input).toHaveValue('praca demo');
  });
});

describe('pasted Google Maps link', () => {
  const FULL =
    'https://www.google.com/maps/place/Praca/@-18.38,-47.45,17z/data=!3d-18.3801!4d-47.4502';

  it('applies the coordinates from the link, then the suggested address from the Worker', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch((url) =>
      url.startsWith('/api/v1/geocode/resolve?')
        ? Promise.resolve(
            env({
              coordinates: [-47.4502, -18.3801],
              place: { ...VALE_PLACE, coordinates: [-47.4502, -18.3801] },
              provider: 'photon',
            }),
          )
        : undefined,
    );
    renderEditor();
    const input = screen.getByRole('combobox', { name: /Endereço ou ponto de encontro/ });
    await user.click(input);
    await user.paste(FULL);
    await waitFor(() => expect(input).toHaveValue(VALE_PLACE.label));
    expect(await screen.findByTestId('map-probe')).toHaveTextContent('pin:-47.4502,-18.3801');
    expect(await screen.findByText(/Vale Demo\/MG/)).toBeInTheDocument();
    expect(await screen.findByText(/Ponto do link aplicado/)).toBeInTheDocument();
    expect(calls(fetchMock, '/api/v1/geocode/resolve?')).toHaveLength(1);
    // the link itself is never searched as an address
    expect(calls(fetchMock, '/api/v1/geocode?')).toHaveLength(0);
  });

  it('short link is resolved by the Worker', async () => {
    const user = userEvent.setup();
    stubFetch((url) =>
      url.startsWith('/api/v1/geocode/resolve?')
        ? Promise.resolve(env({ coordinates: [-47.45, -18.38], place: null, provider: null }))
        : undefined,
    );
    renderEditor();
    const input = screen.getByRole('combobox', { name: /Endereço ou ponto de encontro/ });
    await user.click(input);
    await user.paste('https://maps.app.goo.gl/AbCdEf123');
    await waitFor(() =>
      expect(screen.getByTestId('map-probe')).toHaveTextContent('pin:-47.45,-18.38'),
    );
    expect(await screen.findByText(/Digite o endereço público do encontro/)).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('a point outside Minas Gerais shows a clear error and sets nothing', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    renderEditor();
    const input = screen.getByRole('combobox', { name: /Endereço ou ponto de encontro/ });
    await user.click(input);
    await user.paste('https://www.google.com/maps/@-23.5505,-46.6333,15z');
    expect(await screen.findByRole('alert')).toHaveTextContent(/fora de Minas Gerais/);
    expect(screen.queryByTestId('map-probe')).not.toBeInTheDocument();
    expect(calls(fetchMock, '/api/v1/geocode')).toHaveLength(0);
  });

  it('the Worker rejecting the link (422) is shown, not swallowed', async () => {
    const user = userEvent.setup();
    stubFetch((url) =>
      url.startsWith('/api/v1/geocode/resolve?')
        ? Promise.resolve(apiError('UNPROCESSABLE', 'Não encontramos o ponto neste link.', 422))
        : undefined,
    );
    renderEditor();
    const input = screen.getByRole('combobox', { name: /Endereço ou ponto de encontro/ });
    await user.click(input);
    await user.paste('https://maps.app.goo.gl/Zzzzzzzz');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não encontramos o ponto/);
  });
});

describe('manual coordinates', () => {
  it('are collapsed by default and still editable', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderEditor();
    expect(screen.queryByLabelText(/Latitude/)).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Ajustar coordenadas manualmente' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    const lat = screen.getByLabelText(/Latitude/);
    await user.type(lat, '-18.38');
    await user.type(screen.getByLabelText(/Longitude/), '-47.45');
    const box = screen.getByRole('checkbox', { name: /Confirmo que o ponto/ });
    await user.click(box);
    expect(box).toBeChecked();
    await user.type(lat, '1'); // changing the point undoes the confirmation
    expect(box).not.toBeChecked();
  });
});
