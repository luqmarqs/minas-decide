import { useDeferredValue, useMemo, useState } from 'react';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { Combobox } from '@/components/ui/Combobox';
import { cn } from '@/lib/cn';
import { useTerritoryIndex } from '@/features/electoral-map/hooks';
import {
  buildSearchIndex,
  searchTerritories,
  TERRITORY_TYPE_LABEL,
  type SearchResult,
} from './search';

export interface TerritorySearchProps {
  onSelect: (entry: TerritoryIndexEntry) => void;
  label?: string;
  hideLabel?: boolean;
  placeholder?: string;
  size?: 'md' | 'lg';
  className?: string;
  id?: string;
}

/**
 * "Cidade ou bairro em Minas Gerais" — accessible combobox over the static
 * territories index. Results show the disambiguated label and the territory type.
 */
export function TerritorySearch({
  onSelect,
  label = 'Cidade ou bairro em Minas Gerais',
  hideLabel,
  placeholder = 'Digite o nome da cidade ou do bairro',
  size = 'md',
  className,
  id,
}: TerritorySearchProps) {
  const { index, isLoading, error } = useTerritoryIndex();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const docs = useMemo(() => (index ? buildSearchIndex(index.entries) : []), [index]);
  const results = useMemo(() => searchTerritories(docs, deferred, 8), [docs, deferred]);

  return (
    <Combobox<SearchResult>
      id={id}
      className={className}
      label={label}
      hideLabel={hideLabel}
      placeholder={placeholder}
      size={size}
      inputValue={query}
      onInputChange={setQuery}
      items={results}
      getKey={(r) => r.entry.id}
      getLabel={(r) => r.label}
      loading={isLoading && query.length > 0}
      disabled={!!error && !index}
      hint={
        error && !index
          ? 'A busca está indisponível porque o índice de territórios não carregou.'
          : undefined
      }
      emptyMessage={
        <span>
          Nenhum município ou bairro encontrado para “{query.trim()}”. Confira a grafia ou busque
          pelo município.
        </span>
      }
      renderItem={(r, { active }) => (
        <span className="flex w-full items-baseline justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate">{r.label}</span>
          </span>
          <span className={cn('shrink-0 text-xs', active ? 'text-secondary' : 'text-muted')}>
            {TERRITORY_TYPE_LABEL[r.entry.type]}
          </span>
        </span>
      )}
      onSelect={(r) => {
        setQuery(r.label);
        onSelect(r.entry);
      }}
    />
  );
}
