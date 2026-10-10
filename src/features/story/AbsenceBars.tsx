import { formatInt, formatPercent } from '@/lib/format';
import type { HighlightItem } from '@/features/highlights/format';

const millionsFmt = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
/** 16372372 → "16,4 mi". */
const formatMillions = (n: number) => `${millionsFmt.format(n / 1_000_000)} mi`;

export interface AbsenceRow {
  key: string;
  /** Short label of the group. */
  label: string;
  item: HighlightItem | undefined;
  /** Base of the percentage (people/votes) and how to name it ("aptos", "votos válidos"). */
  base: number | undefined;
  baseLabel: string;
}

/**
 * Step 3 infographic: one full-width bar per group, each on ITS OWN base (100% of the bar =
 * the denominator written beside it), so the three different denominators are visible.
 * Neutral sequential tokens only — never campaign colours.
 */
export function AbsenceBars({ rows }: { rows: AbsenceRow[] }) {
  return (
    <dl className="flex flex-col" data-testid="story-absence">
      {rows.map(({ key, label, item, base, baseLabel }) => {
        const share = item && base ? item.value / base : undefined;
        return (
          <div
            key={key}
            className="grid gap-x-8 gap-y-2 border-t border-border py-5 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-end lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]"
          >
            <div className="min-w-0">
              <dt className="ed-kicker">{label}</dt>
              <dd className="ed-figure ed-figure-lg mt-1">{item ? formatInt(item.value) : '—'}</dd>
            </div>
            <dd className="min-w-0">
              {share !== undefined && base ? (
                <>
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-secondary">
                    <span>
                      <strong className="text-base font-bold text-primary tabular-nums">
                        {formatPercent(share)}
                      </strong>{' '}
                      de {formatMillions(base)} {baseLabel}
                    </span>
                    <span className="ed-caption tabular-nums" aria-hidden="true">
                      100% = {formatMillions(base)}
                    </span>
                  </p>
                  <div
                    className="mt-2 h-4 w-full overflow-hidden rounded-sm border border-border bg-(--map-fill-low)"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full bg-(--map-fill-mid-high)"
                      style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">sem dado</p>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
