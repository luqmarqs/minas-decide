import type { ReactNode } from 'react';
import { formatInt } from '@/lib/format';

/** Editorial primitives shared by the sections of the Métricas tab (hairlines, .ed-*, tokens). */
export function Figure({
  value,
  label,
  large,
}: {
  value: ReactNode;
  label: string;
  large?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className={large ? 'ed-figure-lg' : 'ed-figure'}>{value}</p>
      <p className="ed-caption mt-1">{label}</p>
    </div>
  );
}

/** Labelled horizontal bars as a list (value is real text; the bar is decoration). */
export function RankedBars({
  items,
  label,
  empty,
}: {
  items: { key: string; label: string; count: number }[];
  label: string;
  empty: string;
}) {
  if (items.length === 0) return <p className="ed-caption">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 break-words text-primary">{i.label}</span>
            <span className="font-semibold tabular-nums">{formatInt(i.count)}</span>
          </div>
          <div className="adm-hbar mt-1" aria-hidden="true">
            <span style={{ width: `${Math.max(2, (i.count / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <hr className="ed-rule" />
      <header>
        <p className="ed-kicker">{kicker}</p>
        <h2 id={id} className="font-body text-xl font-semibold tracking-normal">
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}
