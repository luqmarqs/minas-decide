/**
 * Raster icons for the MapLibre symbol layers, drawn once per canvas from tokens
 * (never hex in code): the activity "sun with halo" and the monochrome POI glyph
 * (bus/station, ink on cream in light mode, cream on olive in dark mode).
 * Drawn with Path2D so the map keeps a single WebGL symbol layer per overlay
 * (no DOM marker per point).
 */
import { SUN_PATH, SUN_VIEWBOX } from '@/components/brand/sunGeometry';
import type { MapPalette } from './palette';

export const ICON_SUN = 'mm-icon-sun';
export const ICON_POI = 'mm-icon-poi';

/** 24×24 stroke path shared with the DOM icon (`Icon name="bus"`). */
export const BUS_PATH =
  'M7 3h10a3 3 0 0 1 3 3v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3Zm-3 8h16M4 7h16M7.5 18v2.5M16.5 18v2.5M8 14.5h.01M16 14.5h.01';

function canvas(px: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  return c.getContext('2d');
}

/** Sun marker: translucent halo, light disc with a coloured ring, sun glyph. */
export function drawSunIcon(p: MapPalette, ratio: number): ImageData | null {
  const size = 34;
  const px = Math.round(size * ratio);
  const ctx = canvas(px);
  if (!ctx) return null;
  ctx.scale(ratio, ratio);
  const c = size / 2;
  ctx.fillStyle = p.activityHalo;
  ctx.beginPath();
  ctx.arc(c, c, 16.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.surface;
  ctx.strokeStyle = p.activity;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c, c, 11.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const w = 17;
  const scale = w / SUN_VIEWBOX.width;
  ctx.save();
  ctx.translate(c - w / 2, c - (SUN_VIEWBOX.height * scale) / 2 - 0.5);
  ctx.scale(scale, scale);
  ctx.fillStyle = p.activity;
  ctx.fill(new Path2D(SUN_PATH));
  ctx.restore();
  return ctx.getImageData(0, 0, px, px);
}

/** POI marker: cream/olive disc, ink/cream ring and bus glyph (monochrome). */
export function drawPoiIcon(p: MapPalette, ratio: number): ImageData | null {
  const size = 26;
  const px = Math.round(size * ratio);
  const ctx = canvas(px);
  if (!ctx) return null;
  ctx.scale(ratio, ratio);
  const c = size / 2;
  ctx.fillStyle = p.poiBg;
  ctx.strokeStyle = p.poi;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c, c, 11.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const g = 15;
  ctx.save();
  ctx.translate(c - g / 2, c - g / 2);
  ctx.scale(g / 24, g / 24);
  ctx.strokeStyle = p.poi;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(BUS_PATH));
  ctx.restore();
  return ctx.getImageData(0, 0, px, px);
}
