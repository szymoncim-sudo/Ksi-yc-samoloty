// Base map styles: CARTO Dark Matter (vector, re-tinted to the app palette), Esri imagery, OpenTopoMap.
import type { StyleSpecification } from 'maplibre-gl';

export type BaseLayer = 'dark' | 'sat' | 'topo';

const CARTO = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

function parseColor(s: string): [number, number, number, number] | null {
  s = s.trim();
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  m = s.match(/^hsla?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map((x) => parseFloat(x));
    const [h, sat, l] = [p[0] / 360, p[1] / 100, p[2] / 100];
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const pp = 2 * l - q;
    const f = (t: number) => {
      t = (t + 1) % 1;
      if (t < 1 / 6) return pp + (q - pp) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6;
      return pp;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255, p[3] ?? 1];
  }
  return null;
}

/** Neutral, slightly darker greys: the map recedes behind the data. */
function tint(s: string): string {
  const c = parseColor(s);
  if (!c) return s;
  const [r, g, b, a] = c;
  const v = Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * 0.82);
  return `rgba(${v},${v},${Math.round(v * 0.97)},${a.toFixed(3)})`;
}

function walk(v: unknown): unknown {
  if (typeof v === 'string') return /^(#|rgb|hsl)/i.test(v) ? tint(v) : v;
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = walk(x);
    return o;
  }
  return v;
}

let darkPromise: Promise<StyleSpecification> | null = null;

const GLYPHS = 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf';

const FALLBACK: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#050505' } }],
};

export function loadDarkStyle(): Promise<StyleSpecification> {
  if (!darkPromise) {
    darkPromise = fetch(CARTO)
      .then((r) => r.json())
      .then((style: StyleSpecification) => {
        for (const layer of style.layers) {
          const l = layer as { paint?: Record<string, unknown>; id: string; type: string };
          if (l.paint) {
            for (const key of Object.keys(l.paint)) {
              if (key.endsWith('color')) l.paint[key] = walk(l.paint[key]);
            }
          }
          if (l.type === 'background' && l.paint) l.paint['background-color'] = '#050505';
        }
        return style;
      })
      .catch(() => {
        darkPromise = null;
        return FALLBACK;
      });
  }
  return darkPromise;
}

export function rasterStyle(kind: 'sat' | 'topo'): StyleSpecification {
  if (kind === 'sat') {
    return {
      version: 8,
      glyphs: GLYPHS,
      sources: {
        base: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 19,
          attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
        },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#050505' } },
        { id: 'base', type: 'raster', source: 'base', paint: { 'raster-brightness-max': 0.8, 'raster-saturation': -0.35, 'raster-contrast': 0.05 } },
      ],
    };
  }
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      base: {
        type: 'raster',
        tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
        tileSize: 256,
        maxzoom: 17,
        attribution: '© OpenTopoMap (CC-BY-SA) © OpenStreetMap',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#050505' } },
      { id: 'base', type: 'raster', source: 'base', paint: { 'raster-brightness-max': 0.72, 'raster-saturation': -1, 'raster-contrast': 0.1 } },
    ],
  };
}

export async function styleFor(kind: BaseLayer): Promise<StyleSpecification> {
  return kind === 'dark' ? loadDarkStyle() : rasterStyle(kind);
}

/** SDF airplane icon for symbol layers. */
export function planeIcon(path: string, size = 64): ImageData {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const p = new Path2D(path);
  ctx.translate(size * 0.08, size * 0.08);
  ctx.scale((size * 0.84) / 100, (size * 0.84) / 100);
  ctx.fillStyle = '#fff';
  ctx.fill(p);
  return ctx.getImageData(0, 0, size, size);
}
