/**
 * Vector geometry of the "Minas Decide" sun: a half disc rising from the horizon
 * with 11 wavy, flame-like rays (drawn from scratch after the artwork, not traced).
 * Pure and deterministic so the same path feeds the React mark and the favicon.
 */
export const SUN_VIEWBOX = { width: 100, height: 54 } as const;

const CX = 50;
const CY = 52; // horizon line (flat base of the half disc)
const DISC_R = 21;
const RAY_COUNT = 11;
const RAY_START = 18; // rays start inside the disc so they merge with it
const RAY_END = 47;
const RAY_BASE_WIDTH = 11;
const WAVE_AMPLITUDE = 2.8;
const SAMPLES = 9;

type Pt = [number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Catmull-Rom (open) → cubic Bézier segments, starting with an M command. */
function smoothPath(points: Pt[]): string {
  const [first] = points;
  if (!first) return '';
  let d = `M${r1(first[0])} ${r1(first[1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

function rayOutline(angle: number, index: number): Pt[] {
  const dir: Pt = [Math.cos(angle), -Math.sin(angle)];
  // Perpendicular, rotated clockwise on screen (keeps every sub-path clockwise).
  const perp: Pt = [-dir[1], dir[0]];
  // Alternate the phase slightly so the crown does not look stamped.
  const phase = index % 2 === 0 ? 0 : 0.35;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let s = 0; s <= SAMPLES; s++) {
    const t = s / SAMPLES;
    const r = RAY_START + t * (RAY_END - RAY_START);
    const half = (RAY_BASE_WIDTH / 2) * Math.pow(1 - t, 0.7);
    const wave = WAVE_AMPLITUDE * Math.sin(Math.PI * (1.7 * t + phase)) * Math.min(1, t * 2.2);
    const c: Pt = [CX + dir[0] * r + perp[0] * wave, CY + dir[1] * r + perp[1] * wave];
    const clampY = (y: number) => Math.min(y, CY);
    left.push([c[0] - perp[0] * half, clampY(c[1] - perp[1] * half)]);
    right.push([c[0] + perp[0] * half, clampY(c[1] + perp[1] * half)]);
  }
  // Out along one edge, back along the other: tip is shared.
  return [...right, ...left.reverse().slice(1)];
}

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function buildSunPath(): string {
  // Half disc, clockwise on screen (left → over the top → right).
  const disc = `M${CX - DISC_R} ${CY}A${DISC_R} ${DISC_R} 0 0 1 ${CX + DISC_R} ${CY}Z`;
  const rays: string[] = [];
  const from = (172 * Math.PI) / 180;
  const to = (8 * Math.PI) / 180;
  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = from + ((to - from) * i) / (RAY_COUNT - 1);
    let pts = rayOutline(angle, i);
    if (signedArea(pts) < 0) pts = pts.reverse();
    rays.push(smoothPath(pts));
  }
  return disc + rays.join('');
}

export const SUN_PATH = buildSunPath();

/** Standalone SVG document (favicon / static asset). */
export function sunSvgDocument(color: string, background?: string): string {
  const { width, height } = SUN_VIEWBOX;
  // Square canvas for icons: centre the mark vertically.
  const size = width;
  const dy = (size - height) / 2;
  const bg = background
    ? `<rect width="${size}" height="${size}" rx="18" fill="${background}"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">` +
    `${bg}<path transform="translate(0 ${dy})" fill="${color}" d="${SUN_PATH}"/></svg>`
  );
}
