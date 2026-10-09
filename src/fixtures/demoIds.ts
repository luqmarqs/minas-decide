/** Prefix of the fictitious DEMO activity ids (kept tiny so it can be imported eagerly). */
export const DEMO_ACTIVITY_ID_PREFIX = '00000000-0000-4000-8000-0000000000';

export function isDemoActivityId(id: string): boolean {
  return id.startsWith(DEMO_ACTIVITY_ID_PREFIX);
}
