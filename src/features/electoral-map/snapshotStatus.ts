import type { SnapshotStatus } from '@shared/contracts/metrics.ts';

/** Kept apart from the loader so labels never pull Zod into the initial chunk. */
export const SNAPSHOT_STATUS_LABEL: Record<SnapshotStatus, string> = {
  validated: 'Dados validados',
  partial: 'Dados parciais',
  demo: 'DADOS DEMONSTRATIVOS',
};
