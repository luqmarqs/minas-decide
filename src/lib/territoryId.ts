/**
 * Mirror of `TerritoryId` (shared/contracts/territory.ts) as a plain RegExp so the
 * URL parser of the initial chunk does not import Zod. Parity is enforced by
 * `territoryId.test.ts`.
 */
export const TERRITORY_ID_RE = /^mg(-\d{7})?(-[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

export function isTerritoryId(v: unknown): v is string {
  return typeof v === 'string' && TERRITORY_ID_RE.test(v);
}
