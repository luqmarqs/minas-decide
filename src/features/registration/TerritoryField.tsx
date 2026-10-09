import { useEffect } from 'react';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { TerritorySearch } from '@/features/territory/TerritorySearch';
import { useTerritoryName } from './useTerritoryName';

export interface TerritoryFieldProps {
  id: string;
  value: string | null;
  onChange: (entry: TerritoryIndexEntry) => void;
  error?: string;
  label?: string;
  /** Neighborhoods allowed? (activities/groups may target a neighborhood or a city) */
  allowState?: boolean;
}

/**
 * Pre-filled, editable territory (spec §3.3 step 2): shows the current choice and
 * a search to change it. The search is the shared `TerritorySearch` combobox.
 */
export function TerritoryField({
  id,
  value,
  onChange,
  error,
  label = 'Território',
  allowState = false,
}: TerritoryFieldProps) {
  const { label: current } = useTerritoryName(value);
  const errorId = `${id}-error`;
  const currentId = `${id}-current`;

  // TerritorySearch owns its input; link our error/current text to it for screen readers.
  useEffect(() => {
    const input = document.getElementById(id);
    if (!input) return;
    const ids = [value ? currentId : null, error ? errorId : null].filter(Boolean).join(' ');
    if (ids) input.setAttribute('aria-describedby', ids);
    else input.removeAttribute('aria-describedby');
    if (error) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }, [id, value, error, currentId, errorId]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-primary">
        {label}
        <span className="ml-1 font-normal text-muted">
          <span aria-hidden="true">*</span>
          <span className="sr-only">(obrigatório)</span>
        </span>
      </legend>
      <p id={currentId} className="text-base text-primary" aria-live="polite">
        {value ? (
          <>
            Selecionado: <strong>{current ?? 'carregando nome…'}</strong>
          </>
        ) : (
          <span className="text-muted">Nenhum território escolhido.</span>
        )}
      </p>
      <TerritorySearch
        id={id}
        label={value ? 'Trocar cidade ou bairro' : 'Buscar cidade ou bairro em Minas Gerais'}
        onSelect={(entry) => {
          if (entry.type === 'state' && !allowState) return;
          onChange(entry);
        }}
      />
      {error ? (
        <p id={errorId} className="flex items-start gap-1 text-sm font-medium text-error">
          <span aria-hidden="true">!</span>
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
