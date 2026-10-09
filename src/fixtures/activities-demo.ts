/**
 * DEMO activities — FICTITIOUS. Only shown when BOTH the electoral snapshot is in
 * demo mode AND the activities API is unreachable, always with a visible
 * "ATIVIDADE DEMONSTRATIVA" label. RSVP is disabled for them.
 */
import type { PublicActivity } from '@shared/contracts/activities.ts';
import { DEMO_MUNICIPALITIES } from './electoral/demo';
import { DEMO_ACTIVITY_ID_PREFIX } from './demoIds';

function daysFromNowAt(days: number, utcHour: number, now: Date): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, utcHour, 0, 0),
  );
  return d.toISOString();
}

export function buildDemoActivities(now = new Date()): PublicActivity[] {
  const picks = [0, 0, 3, 6, 8, 10];
  const types = ['encontro', 'caminhada', 'reuniao', 'mutirao', 'panfletagem', 'outro'] as const;
  return picks.map((muniIdx, i) => {
    const m = DEMO_MUNICIPALITIES[muniIdx]!;
    const jitter = (i % 3) * 0.006;
    return {
      id: `${DEMO_ACTIVITY_ID_PREFIX}${String(i + 1).padStart(2, '0')}`,
      title: `Atividade demonstrativa ${i + 1}`,
      type: types[i % types.length]!,
      description_sanitized:
        'Exemplo fictício para demonstrar a interface. Não é um evento real e não acontecerá.',
      starts_at: daysFromNowAt(3 + i * 2, 13 + (i % 3), now),
      ends_at: daysFromNowAt(3 + i * 2, 15 + (i % 3), now),
      timezone: 'America/Sao_Paulo',
      location_public: `Praça Exemplo, ${m.name} (demonstração)`,
      coordinates: [m.centroid[0] + jitter, m.centroid[1] - jitter],
      territory_id: `mg-${m.ibge}`,
      status: i === 5 ? 'cancelled' : 'published',
      rsvp_count_approx: 0,
      contact_public: null,
      updated_at: now.toISOString(),
    } satisfies PublicActivity;
  });
}
