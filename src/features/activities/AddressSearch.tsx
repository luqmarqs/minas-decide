import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { GeocodePlace, GeocodeSuggestion } from '@shared/contracts/geocode.ts';
import {
  googleMapsLinkKind,
  insideMgBbox,
  parseGoogleMapsCoords,
} from '@shared/schemas/google-maps.ts';
import { Combobox } from '@/components/ui/Combobox';
import { messageForError } from '@/lib/api';
import { fetchAddressPlace, newSessionToken, resolveMapsLink, searchAddress } from './geocodeApi';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;
const OUT_OF_MG = 'Este local fica fora de Minas Gerais. Confira o link ou o endereço.';

export const GOOGLE_ATTRIBUTION = 'Powered by Google';
export const PHOTON_ATTRIBUTION = 'Busca de endereços © OpenStreetMap (Photon)';

export interface AddressSearchProps {
  id: string;
  value: string;
  onChange: (text: string) => void;
  /** A suggestion was chosen or a Google Maps link was resolved. */
  onPlace: (place: GeocodePlace) => void;
  error?: string;
  hint: string;
}

type Status =
  { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'ok' | 'error'; text: string };

/**
 * "Endereço ou ponto de encontro" with autocomplete (Google Places via the Worker, Photon
 * fallback) and Google Maps link detection. Plain combobox: free typing always works.
 */
export function AddressSearch({ id, value, onChange, onPlace, error, hint }: AddressSearchProps) {
  const [debounced, setDebounced] = useState(value);
  // Text set by a selection/initial value: no search for it (and no empty-results popup).
  const [quiet, setQuiet] = useState(value);
  const [session, setSession] = useState(newSessionToken);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [provider, setProvider] = useState<'google' | 'photon' | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);

  const wanted = debounced.trim();
  const search = useQuery({
    queryKey: ['geocode', wanted],
    queryFn: ({ signal }) => searchAddress(wanted, session, signal),
    enabled:
      wanted.length >= MIN_CHARS &&
      wanted === value.trim() &&
      wanted !== quiet.trim() &&
      !googleMapsLinkKind(wanted),
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const items = search.data?.items ?? [];
  const shownProvider = search.data?.provider ?? provider;

  // Same wiring as TerritoryField: the combobox owns its <input>; link error text to it.
  const errorId = `${id}-error`;
  useEffect(() => {
    const input = document.getElementById(id);
    if (!input) return;
    const base = `${id}-hint`;
    input.setAttribute('aria-describedby', error ? `${base} ${errorId}` : base);
    if (error) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }, [id, error, errorId]);

  async function applyLink(url: string) {
    const mine = ++seq.current;
    const direct = parseGoogleMapsCoords(url);
    if (direct && !insideMgBbox(direct[0], direct[1])) {
      setStatus({ kind: 'error', text: OUT_OF_MG });
      return;
    }
    if (direct) {
      // Instant: the point comes straight from the link; the address is enriched below.
      onPlace({
        label: '',
        street: null,
        number: null,
        neighborhood: null,
        city: null,
        coordinates: direct,
      });
    }
    setStatus({ kind: 'busy', text: 'Lendo o link do Google Maps…' });
    try {
      const r = await resolveMapsLink(url);
      if (seq.current !== mine) return;
      const place: GeocodePlace = r.place
        ? { ...r.place, coordinates: r.coordinates }
        : {
            label: '',
            street: null,
            number: null,
            neighborhood: null,
            city: null,
            coordinates: r.coordinates,
          };
      setQuiet(place.label);
      onChange(place.label);
      onPlace(place);
      if (r.provider) setProvider(r.provider);
      setStatus({
        kind: 'ok',
        text: place.label
          ? 'Ponto do link aplicado. Confira o endereço sugerido e o ponto no mapa.'
          : 'Ponto do link aplicado. Digite o endereço público do encontro.',
      });
    } catch (e) {
      if (seq.current !== mine) return;
      const text = messageForError(e);
      if (direct) {
        setQuiet('');
        onChange('');
        setStatus({
          kind: 'ok',
          text: 'Ponto do link aplicado, mas não conseguimos sugerir o endereço. Digite o endereço público.',
        });
      } else setStatus({ kind: 'error', text });
    }
  }

  async function choose(item: GeocodeSuggestion) {
    const mine = ++seq.current;
    let place = item.place;
    if (!place) {
      setStatus({ kind: 'busy', text: 'Carregando o endereço…' });
      try {
        place = (await fetchAddressPlace(item.id, session)).place;
      } catch (e) {
        if (seq.current === mine) setStatus({ kind: 'error', text: messageForError(e) });
        return;
      }
      if (seq.current !== mine) return;
    }
    setQuiet(place.label);
    onChange(place.label);
    onPlace(place);
    setSession(newSessionToken());
    setStatus({
      kind: 'ok',
      text: 'Endereço aplicado. Arraste o pino no mapa se precisar ajustar o ponto.',
    });
  }

  function onInput(text: string) {
    const next = text.slice(0, 240);
    onChange(next);
    if (googleMapsLinkKind(next)) void applyLink(next.trim());
    else if (status.kind !== 'idle') {
      seq.current++;
      setStatus({ kind: 'idle' });
    }
  }

  const typing = value.trim().length >= MIN_CHARS && value.trim() !== quiet.trim();
  const isLink = !!googleMapsLinkKind(value.trim());
  return (
    <div className="flex flex-col gap-1.5">
      <Combobox<GeocodeSuggestion>
        id={id}
        label="Endereço ou ponto de encontro público *"
        placeholder="Digite o endereço ou cole um link do Google Maps"
        inputValue={value}
        onInputChange={onInput}
        items={isLink ? [] : items}
        getKey={(s) => s.id}
        getLabel={(s) => (s.secondary ? `${s.label}, ${s.secondary}` : s.label)}
        renderItem={(s) => (
          <span className="min-w-0">
            <span className="block truncate">{s.label}</span>
            {s.secondary ? (
              <span className="block truncate text-xs text-muted">{s.secondary}</span>
            ) : null}
          </span>
        )}
        onSelect={(s) => void choose(s)}
        loading={!isLink && typing && (search.isFetching || value.trim() !== wanted)}
        minChars={isLink || !typing ? Number.POSITIVE_INFINITY : MIN_CHARS}
        hint={hint}
        emptyMessage={
          search.isError
            ? `${messageForError(search.error)} Você pode digitar o endereço manualmente.`
            : 'Nenhum endereço encontrado. Digite o endereço manualmente e marque o ponto no mapa.'
        }
      />
      {error ? (
        <p id={errorId} className="flex items-start gap-1 text-sm font-medium text-error">
          <span aria-hidden="true">!</span>
          <span>{error}</span>
        </p>
      ) : null}
      <p
        className={
          status.kind === 'error' ? 'text-sm font-medium text-error' : 'text-sm text-secondary'
        }
        role={status.kind === 'error' ? 'alert' : 'status'}
        aria-live="polite"
      >
        {status.kind === 'idle' ? null : status.text}
      </p>
      {shownProvider ? (
        <p className="text-xs text-muted">
          {shownProvider === 'google' ? GOOGLE_ATTRIBUTION : PHOTON_ATTRIBUTION}
        </p>
      ) : null}
    </div>
  );
}
