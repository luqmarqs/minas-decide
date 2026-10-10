import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PlateHeadingProps {
  /** Número da "prancha" (1, 2, 3…): elemento de continuidade entre as seções depois do hero. */
  number: number;
  /** Rótulo curto em caixa alta acima do título (ex.: "Narrativa", "Números", "Mapa"). */
  kicker: string;
  /** Título da seção (vira o h2; o id é usado por aria-labelledby). */
  title: ReactNode;
  id: string;
  /** Conteúdo opcional ao lado do título (selo DEMO, nota curta). */
  aside?: ReactNode;
  /** Linha de apoio abaixo do título (1–2 frases). */
  lead?: ReactNode;
  className?: string;
  /** Tamanho do título: `lg` para aberturas de seção, `md` para subseções. */
  size?: 'lg' | 'md';
}

/**
 * Abertura de seção da camada editorial (redesign 2026-10): filete forte + numeração + kicker +
 * título. Substitui caixas/cards como marcador de seção; a numeração atravessa narrativa →
 * números → mapa → agenda como pranchas de um mesmo atlas. Só tokens semânticos e classes `.ed-*`.
 */
export function PlateHeading({
  number,
  kicker,
  title,
  id,
  aside,
  lead,
  className,
  size = 'lg',
}: PlateHeadingProps) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      <hr className="ed-rule-strong" aria-hidden="true" />
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="ed-figure ed-figure-md tabular-nums" aria-hidden="true">
          {String(number).padStart(2, '0')}
        </span>
        <p className="ed-kicker">
          <span className="sr-only">Seção {number}: </span>
          {kicker}
        </p>
        {aside ? <div className="ml-auto flex items-center gap-2">{aside}</div> : null}
      </div>
      <h2
        id={id}
        className={cn(
          'max-w-[22ch] text-balance',
          size === 'lg' ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-2xl sm:text-3xl',
        )}
      >
        {title}
      </h2>
      {lead ? <p className="ed-measure text-base text-secondary sm:text-lg">{lead}</p> : null}
    </header>
  );
}
