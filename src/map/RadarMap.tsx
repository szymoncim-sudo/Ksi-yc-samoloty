import maplibregl from './maplibre';
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { PLANFORM_PATHS } from '../lib/aircraft';
import { moonAltAz } from '../lib/astro';
import { extrapolate } from '../lib/flights';
import { altitude as fmtAlt } from '../lib/format';
import { circlePolygon, DEG, destination } from '../lib/geo';
import type { Aircraft, CorridorPoint, Pass, PredictResult, Site } from '../lib/transit';
import { planeIcon, styleFor, type BaseLayer } from './style';

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: 'FeatureCollection', features: [] };
export const FONT = ['Montserrat Medium', 'Open Sans Regular', 'Noto Sans Regular', 'Noto Sans CJK JP Regular'];

export interface RadarMapApi {
  flyToSite(site: Site): void;
  fitPass(p: Pass, site: Site): void;
}

interface Props {
  active: boolean;
  sites: Site[];
  activeSiteId: string | null;
  aircraft: Aircraft[];
  prediction: PredictResult | null;
  selectedKey: string | null;
  base: BaseLayer;
  showAmbient: boolean;
  units: 'metric' | 'aviation';
  gps: { lat: number; lon: number } | null;
  standLabel: (m: number) => string;
  onSelect(key: string | null): void;
  apiRef?: React.MutableRefObject<RadarMapApi | null>;
}

function bandPolygon(pts: CorridorPoint[]): [number, number][] | null {
  if (pts.length < 2) return null;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const kLon = 111320 * Math.cos(pts[i].lat * DEG);
    const kLat = 110540;
    let dx = (b.lon - a.lon) * kLon;
    let dy = (b.lat - a.lat) * kLat;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const w = pts[i].w;
    left.push([pts[i].lon + (-dy * w) / kLon, pts[i].lat + (dx * w) / kLat]);
    right.push([pts[i].lon - (-dy * w) / kLon, pts[i].lat - (dx * w) / kLat]);
  }
  return [...left, ...right.reverse(), left[0]];
}

const KIND_COLORS = ['match', ['get', 'kind'], 'transit', '#ff6a1f', 'near', '#ecebe5', 'reach', '#ecebe5', '#7c7b75'] as unknown as maplibregl.ExpressionSpecification;

function addOverlays(map: MLMap) {
  const src = (id: string) => {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY });
  };
  ['reach', 'moonray', 'moonticks', 'tracks', 'amb', 'corr', 'corrline', 'ticks', 'move', 'aircraft'].forEach(src);
  if (!map.hasImage('plane')) map.addImage('plane', planeIcon(PLANFORM_PATHS.jet2), { sdf: true });
  const add = (l: maplibregl.LayerSpecification) => {
    if (!map.getLayer(l.id)) map.addLayer(l);
  };
  add({ id: 'reach-fill', type: 'fill', source: 'reach', paint: { 'fill-color': '#ecebe5', 'fill-opacity': 0.025 } });
  add({ id: 'reach-line', type: 'line', source: 'reach', paint: { 'line-color': '#ecebe5', 'line-opacity': 0.4, 'line-width': 1, 'line-dasharray': [2, 3] } });
  add({
    id: 'moonray',
    type: 'line',
    source: 'moonray',
    paint: {
      'line-color': '#ecebe5',
      'line-opacity': 0.7,
      'line-width': 1,
      'line-dasharray': [2, 2],
    },
  });
  add({
    id: 'moonticks',
    type: 'circle',
    source: 'moonticks',
    paint: { 'circle-radius': 2.5, 'circle-color': '#000', 'circle-stroke-color': '#ecebe5', 'circle-stroke-width': 1 },
  });
  add({
    id: 'moonticks-label',
    type: 'symbol',
    source: 'moonticks',
    minzoom: 7,
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 10,
      'text-offset': [0, 1.1],
      'text-font': FONT,
      'text-allow-overlap': false,
    },
    paint: { 'text-color': '#a09f98', 'text-halo-color': '#000', 'text-halo-width': 1.4 },
  });
  add({
    id: 'tracks',
    type: 'line',
    source: 'tracks',
    paint: { 'line-color': '#ecebe5', 'line-opacity': 0.12, 'line-width': 1, 'line-dasharray': [2, 2] },
  });
  add({
    id: 'amb',
    type: 'line',
    source: 'amb',
    paint: {
      'line-color': '#7c7b75',
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.18, 11, 0.4],
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 13, 3],
    },
  });
  add({
    id: 'corr-fill',
    type: 'fill',
    source: 'corr',
    paint: { 'fill-color': KIND_COLORS, 'fill-opacity': ['case', ['get', 'sel'], 0.35, 0.16] },
  });
  add({
    id: 'corr-glow',
    type: 'line',
    source: 'corrline',
    paint: {
      'line-color': KIND_COLORS,
      'line-opacity': ['case', ['get', 'sel'], 0.22, 0],
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 5, 13, 10],
      'line-blur': 4,
    },
  });
  add({
    id: 'corr-line',
    type: 'line',
    source: 'corrline',
    paint: {
      'line-color': KIND_COLORS,
      'line-opacity': ['case', ['get', 'sel'], 1, 0.75],
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.2, 13, ['case', ['get', 'sel'], 2.6, 1.8]],
    },
  });
  add({
    id: 'ticks',
    type: 'circle',
    source: 'ticks',
    paint: { 'circle-radius': ['case', ['get', 'major'], 3, 1.6], 'circle-color': '#ff6a1f', 'circle-stroke-color': '#000', 'circle-stroke-width': 1 },
  });
  add({
    id: 'ticks-label',
    type: 'symbol',
    source: 'ticks',
    filter: ['get', 'major'],
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 10.5,
      'text-offset': [0, -1.1],
      'text-font': FONT,
    },
    paint: { 'text-color': '#ff8f57', 'text-halo-color': '#000', 'text-halo-width': 1.5 },
  });
  add({
    id: 'move-line',
    type: 'line',
    source: 'move',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#ecebe5', 'line-width': 1.5, 'line-dasharray': [1.5, 1.5] },
  });
  add({
    id: 'move-pt',
    type: 'circle',
    source: 'move',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 6, 'circle-color': '#ecebe5', 'circle-stroke-color': '#000', 'circle-stroke-width': 2 },
  });
  add({
    id: 'move-label',
    type: 'symbol',
    source: 'move',
    filter: ['==', ['geometry-type'], 'Point'],
    layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.5], 'text-font': FONT },
    paint: { 'text-color': '#ecebe5', 'text-halo-color': '#000', 'text-halo-width': 1.6 },
  });
  add({
    id: 'ac-glow',
    type: 'circle',
    source: 'aircraft',
    filter: ['any', ['get', 'sel'], ['==', ['get', 'kind'], 'transit']],
    paint: {
      'circle-radius': ['case', ['get', 'sel'], 20, 14],
      'circle-color': KIND_COLORS,
      'circle-opacity': 0.18,
      'circle-blur': 0.6,
    },
  });
  add({
    id: 'aircraft',
    type: 'symbol',
    source: 'aircraft',
    layout: {
      'icon-image': 'plane',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.26, 9, 0.38, 13, 0.55],
      'icon-rotate': ['get', 'track'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'rank'],
      'text-field': ['step', ['zoom'], '', 8, ['get', 'label']],
      'text-size': 10.5,
      'text-offset': [0, 1.5],
      'text-anchor': 'top',
      'text-font': FONT,
      'text-optional': true,
    },
    paint: {
      'icon-color': ['case', ['get', 'sel'], '#ffffff', KIND_COLORS],
      'icon-opacity': ['case', ['==', ['get', 'kind'], 'none'], 0.85, 1],
      'text-color': ['case', ['==', ['get', 'kind'], 'none'], '#7c7b75', '#ecebe5'],
      'text-halo-color': '#000',
      'text-halo-width': 1.4,
    },
  });
}

export function RadarMap(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const gpsMarker = useRef<maplibregl.Marker | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const styleReady = useRef(false);

  // init
  useEffect(() => {
    if (!el.current) return;
    const s0 = props.sites.find((s) => s.id === props.activeSiteId) ?? props.sites[0];
    const map = new maplibregl.Map({
      container: el.current,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#050505' } }] },
      center: s0 ? [s0.lon, s0.lat] : [19.4, 52.1],
      zoom: s0 ? 8.6 : 5.5,
      attributionControl: { compact: true },
      dragRotate: true,
      pitchWithRotate: false,
      maxPitch: 0,
      fadeDuration: 150,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    map.on('style.load', () => {
      addOverlays(map);
      styleReady.current = true;
      pushData();
      pushAircraft();
    });
    const pick = (e: maplibregl.MapMouseEvent) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['aircraft', 'corr-fill', 'corr-line', 'ac-glow'].filter((l) => map.getLayer(l)) });
      const key = f.map((x) => x.properties?.key).find(Boolean);
      latest.current.onSelect(key ?? null);
    };
    map.on('click', pick);
    if (props.apiRef) {
      props.apiRef.current = {
        flyToSite: (site) => map.flyTo({ center: [site.lon, site.lat], zoom: Math.max(map.getZoom(), 9), duration: 900 }),
        fitPass: (p, site) => {
          const c = latest.current.prediction?.corridors.find((x) => x.key === p.key);
          const pts: [number, number][] = [[site.lon, site.lat]];
          if (p.move) pts.push([p.move.lon, p.move.lat]);
          if (c) {
            const near = c.pts.filter((q) => Math.abs(q.t - (p.move?.tCenter ?? p.t)) < 12);
            near.forEach((q) => pts.push([q.lon, q.lat]));
          }
          const b = pts.reduce((bb, q) => bb.extend(q), new maplibregl.LngLatBounds(pts[0], pts[0]));
          map.fitBounds(b, { padding: { top: 120, bottom: window.innerWidth >= 1024 ? 80 : 340, left: 60, right: window.innerWidth >= 1024 ? 480 : 60 }, maxZoom: 15.5, duration: 1100 });
        },
      };
    }
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // base layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let alive = true;
    styleReady.current = false;
    styleFor(props.base).then((st) => {
      if (alive) map.setStyle(st, { diff: false });
    });
    return () => {
      alive = false;
    };
  }, [props.base]);

  useEffect(() => {
    if (props.active) setTimeout(() => mapRef.current?.resize(), 50);
  }, [props.active]);

  // site markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    markers.current = props.sites
      .filter((s) => s.id !== 'gps')
      .map((s, i) => {
        const d = document.createElement('div');
        d.innerHTML = `<div class="pin ${s.id === props.activeSiteId ? '' : 'pin--off'}">${i + 1}</div>`;
        d.title = s.name;
        return new maplibregl.Marker({ element: d, anchor: 'center' }).setLngLat([s.lon, s.lat]).addTo(map);
      });
  }, [props.sites, props.activeSiteId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.gps) {
      if (!gpsMarker.current) {
        const d = document.createElement('div');
        d.className = 'gps-dot';
        gpsMarker.current = new maplibregl.Marker({ element: d }).setLngLat([props.gps.lon, props.gps.lat]).addTo(map);
      } else gpsMarker.current.setLngLat([props.gps.lon, props.gps.lat]);
    } else if (gpsMarker.current) {
      gpsMarker.current.remove();
      gpsMarker.current = null;
    }
  }, [props.gps]);

  function pushData() {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;
    const p = latest.current;
    const set = (id: string, data: FC) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
    // reach circles
    set('reach', {
      type: 'FeatureCollection',
      features: p.sites
        .filter((s) => s.reachM > 0)
        .map((s) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circlePolygon(s.lat, s.lon, s.reachM)] } })),
    });
    // moon line-of-sight rays with flight-level intercepts
    const now = new Date();
    const rays: GeoJSON.Feature[] = [];
    const ticks: GeoJSON.Feature[] = [];
    for (const s of p.sites) {
      if (s.id !== p.activeSiteId && p.sites.length > 1) continue;
      const m = moonAltAz(now, { lat: s.lat, lon: s.lon, elev: s.elevMsl });
      if (m.alt < 2) continue;
      const t = Math.tan(m.alt * DEG);
      const end = destination(s.lat, s.lon, m.az, Math.min(200000, 13000 / t));
      rays.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[s.lon, s.lat], [end[1], end[0]]] } });
      for (const fl of [100, 200, 300, 400]) {
        const h = fl * 30.48;
        const [la, lo] = destination(s.lat, s.lon, m.az, h / t);
        ticks.push({ type: 'Feature', properties: { label: `FL${fl}` }, geometry: { type: 'Point', coordinates: [lo, la] } });
      }
    }
    set('moonray', { type: 'FeatureCollection', features: rays });
    set('moonticks', { type: 'FeatureCollection', features: ticks });
    // predicted tracks
    const pr = p.prediction;
    set('tracks', {
      type: 'FeatureCollection',
      features: Object.entries(pr?.tracks ?? {}).map(([hex, coords]) => ({ type: 'Feature', properties: { hex }, geometry: { type: 'LineString', coordinates: coords } })),
    });
    // corridors
    const kindOf = new Map((pr?.passes ?? []).map((x) => [x.key, x.kind]));
    const corr: GeoJSON.Feature[] = [];
    const lines: GeoJSON.Feature[] = [];
    const amb: GeoJSON.Feature[] = [];
    const tk: GeoJSON.Feature[] = [];
    for (const c of pr?.corridors ?? []) {
      if (!c.highlight) {
        if (p.showAmbient) amb.push({ type: 'Feature', properties: { hex: c.hex }, geometry: { type: 'LineString', coordinates: c.pts.map((q) => [q.lon, q.lat]) } });
        continue;
      }
      const kind = kindOf.get(c.key) ?? 'near';
      const sel = c.key === p.selectedKey;
      const poly = bandPolygon(c.pts);
      if (poly) corr.push({ type: 'Feature', properties: { key: c.key, kind, sel }, geometry: { type: 'Polygon', coordinates: [poly] } });
      lines.push({ type: 'Feature', properties: { key: c.key, kind, sel }, geometry: { type: 'LineString', coordinates: c.pts.map((q) => [q.lon, q.lat]) } });
      if (sel) {
        const sp = pr?.passes.find((x) => x.key === c.key);
        const tc = sp?.move?.tCenter ?? sp?.t ?? c.pts[Math.floor(c.pts.length / 2)].t;
        for (const q of c.pts) {
          const d = q.t - tc;
          if (Math.abs(d - Math.round(d / 2) * 2) > 0.5) continue;
          const r = Math.round(d);
          const major = Math.abs(d - Math.round(d / 10) * 10) <= 0.5;
          const label = r === 0 ? '' : `${r > 0 ? '+' : '−'}${Math.abs(r)} s`;
          tk.push({ type: 'Feature', properties: { major, label }, geometry: { type: 'Point', coordinates: [q.lon, q.lat] } });
        }
      }
    }
    set('corr', { type: 'FeatureCollection', features: corr });
    set('corrline', { type: 'FeatureCollection', features: lines });
    set('amb', { type: 'FeatureCollection', features: amb });
    set('ticks', { type: 'FeatureCollection', features: tk });
    // move hint
    const selPass = pr?.passes.find((x) => x.key === p.selectedKey);
    const site = selPass ? p.sites.find((s) => s.id === selPass.siteId) : null;
    const mv: GeoJSON.Feature[] = [];
    if (selPass?.move && site && selPass.move.distM > 15) {
      mv.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[site.lon, site.lat], [selPass.move.lon, selPass.move.lat]] } });
      mv.push({
        type: 'Feature',
        properties: { label: p.standLabel(selPass.move.distM) },
        geometry: { type: 'Point', coordinates: [selPass.move.lon, selPass.move.lat] },
      });
    }
    set('move', { type: 'FeatureCollection', features: mv });
  }

  function pushAircraft() {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;
    const p = latest.current;
    const now = Date.now() / 1000;
    const passByHex = new Map<string, Pass>();
    for (const x of p.prediction?.passes ?? []) {
      const prev = passByHex.get(x.hex);
      const rank = (k: Pass['kind']) => (k === 'transit' ? 3 : k === 'reach' ? 2 : 1);
      if (!prev || rank(x.kind) > rank(prev.kind)) passByHex.set(x.hex, x);
    }
    const sel = p.prediction?.passes.find((x) => x.key === p.selectedKey);
    const features: GeoJSON.Feature[] = p.aircraft.map((a) => {
      const [lon, lat] = extrapolate(a, Math.min(now, a.tPos + 60));
      const ps = passByHex.get(a.hex);
      const kind = ps ? ps.kind : 'none';
      const isSel = sel?.hex === a.hex;
      return {
        type: 'Feature',
        properties: {
          key: ps?.key ?? null,
          kind,
          sel: isSel,
          track: a.track,
          rank: isSel ? 10 : kind === 'transit' ? 5 : kind === 'none' ? 0 : 3,
          label: `${a.callsign || a.reg || a.hex}\n${fmtAlt(a.altFt, p.units)}`,
        },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      };
    });
    (map.getSource('aircraft') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }

  useEffect(pushData, [props.prediction, props.sites, props.selectedKey, props.showAmbient, props.activeSiteId]);
  useEffect(pushAircraft, [props.aircraft, props.prediction, props.selectedKey, props.units]);

  // smooth aircraft motion + periodic moon-ray refresh
  useEffect(() => {
    if (!props.active) return;
    const id = setInterval(pushAircraft, 1000);
    const id2 = setInterval(pushData, 30000);
    return () => {
      clearInterval(id);
      clearInterval(id2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.active]);

  return <div ref={el} className="map" />;
}
