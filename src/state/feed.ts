// Live data loop: fetch aircraft → normalise → predict (in a worker) → store.
import { moonAltAz } from '../lib/astro';
import { syntheticTransit } from '../lib/demo';
import { fetchFeed, normalize, type RawAc } from '../lib/flights';
import { DEG, distanceM, geoidUndulation } from '../lib/geo';
import { fetchElevation } from '../lib/services';
import type { Aircraft, PredictOptions, PredictResult, Site } from '../lib/transit';
import { GPS_SITE_ID, useStore } from './store';

type St = ReturnType<typeof useStore.getState>;

export function engineSites(st: Pick<St, 'sites' | 'settings' | 'gps'>): Site[] {
  const out: Site[] = [];
  for (const s of st.sites) {
    if (!s.enabled) continue;
    const elevMsl = (s.ground ?? 0) + s.agl;
    out.push({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      elevMsl,
      hEll: elevMsl + geoidUndulation(s.lat, s.lon),
      reachM: s.reachKm * 1000,
    });
  }
  if (st.settings.useGps && st.gps) {
    const elevMsl = (st.gps.ground ?? 0) + 1.7;
    out.push({
      id: GPS_SITE_ID,
      name: 'GPS',
      lat: st.gps.lat,
      lon: st.gps.lon,
      elevMsl,
      hEll: elevMsl + geoidUndulation(st.gps.lat, st.gps.lon),
      reachM: 1500,
    });
  }
  return out;
}

export const EMPTY_RESULT: PredictResult = { passes: [], corridors: [], tracks: {}, moonUp: {}, computedAt: 0, ms: 0 };

// ------------------------------------------------------------------ worker client
let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, (r: PredictResult) => void>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('../workers/predict.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const cb = pending.get(e.data.id);
        pending.delete(e.data.id);
        if (cb) cb(e.data.res ?? EMPTY_RESULT);
      };
      worker.onerror = () => {
        workerBroken = true;
        worker = null;
      };
    } catch {
      workerBroken = true;
      return null;
    }
  }
  return worker;
}

async function runPredict(aircraft: Aircraft[], sites: Site[], opts: PredictOptions): Promise<PredictResult> {
  const w = getWorker();
  if (w) {
    return new Promise((resolve) => {
      const id = ++seq;
      const timeout = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          workerBroken = true;
          import('../lib/transit').then((m) => resolve(m.predict(aircraft, sites, opts)));
        }
      }, 8000);
      pending.set(id, (r) => {
        clearTimeout(timeout);
        resolve(r);
      });
      w.postMessage({ id, aircraft, sites, opts });
    });
  }
  const m = await import('../lib/transit');
  return m.predict(aircraft, sites, opts);
}

// ------------------------------------------------------------------ demo transit
let demo: Aircraft | null = null;

/** Injects a simulated aircraft that will cross the Moon over the active site in `lead` seconds. */
export function startDemo(lead = 100): boolean {
  const st = useStore.getState();
  const sites = engineSites(st);
  const site = sites.find((s) => s.id === st.activeSiteId) ?? sites[0];
  if (!site) return false;
  const ac = syntheticTransit(site, Date.now() / 1000, lead);
  if (!ac) return false;
  demo = ac;
  st.setAircraft([...st.aircraft.filter((a) => a.hex !== ac.hex), ac]);
  recompute();
  return true;
}

function withDemo(list: Aircraft[]): Aircraft[] {
  if (!demo) return list;
  if (Date.now() / 1000 - demo.tPos > 400) {
    demo = null;
    return list;
  }
  return [...list.filter((a) => a.hex !== demo!.hex), demo];
}

// ------------------------------------------------------------------ loop
let timer: ReturnType<typeof setTimeout> | undefined;
let prevMap = new Map<string, Aircraft>();
let running = false;
let recomputeTimer: ReturnType<typeof setTimeout> | undefined;

function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(tick, ms);
}

function moonUpSoon(s: Site, now: number, horizon: number, minAlt: number): { up: boolean; alt: number } {
  let best = -90;
  for (const f of [0, 0.5, 1]) {
    const a = moonAltAz(new Date((now + f * horizon) * 1000), { lat: s.lat, lon: s.lon, elev: s.elevMsl }).alt;
    best = Math.max(best, a);
  }
  return { up: best >= minAlt, alt: best };
}

interface Cluster {
  lat: number;
  lon: number;
  distNm: number;
}

function clusters(sites: Site[], alts: number[], horizonSec: number): Cluster[] {
  const groups: { sites: Site[]; alts: number[] }[] = [];
  sites.forEach((s, i) => {
    const g = groups.find((g) => distanceM(g.sites[0].lat, g.sites[0].lon, s.lat, s.lon) < 120000);
    if (g) {
      g.sites.push(s);
      g.alts.push(alts[i]);
    } else groups.push({ sites: [s], alts: [alts[i]] });
  });
  return groups.map((g) => {
    const lat = g.sites.reduce((a, s) => a + s.lat, 0) / g.sites.length;
    const lon = g.sites.reduce((a, s) => a + s.lon, 0) / g.sites.length;
    const spread = Math.max(...g.sites.map((s) => distanceM(lat, lon, s.lat, s.lon) + s.reachM));
    const alt = Math.max(6, Math.min(...g.alts));
    const reach = 13000 / Math.tan(alt * DEG) + 250 * horizonSec + spread + 10000;
    return { lat, lon, distNm: Math.min(250, Math.max(30, reach / 1852)) };
  });
}

async function tick() {
  if (document.hidden) {
    schedule(4000);
    return;
  }
  const st = useStore.getState();
  const sites = engineSites(st);
  const now = Date.now() / 1000;
  const H = st.settings.horizonMin * 60;
  if (!sites.length) {
    st.setFeed({ status: 'idle', reason: 'no-sites', count: 0 });
    st.setPrediction(EMPTY_RESULT);
    schedule(3000);
    return;
  }
  const vis = sites.map((s) => moonUpSoon(s, now, H, st.settings.minMoonAlt));
  const upSites = sites.filter((_, i) => vis[i].up);
  if (!upSites.length) {
    demo = null;
    st.setFeed({ status: 'paused', reason: 'moon-down' });
    st.setPrediction({ ...EMPTY_RESULT, computedAt: now, moonUp: Object.fromEntries(sites.map((s) => [s.id, false])) });
    schedule(60000);
    return;
  }
  if (st.feed.status !== 'ok') st.setFeed({ status: 'loading' });
  try {
    const cl = clusters(upSites, vis.filter((v) => v.up).map((v) => v.alt), H);
    const all = new Map<string, RawAc>();
    let serverNow = now;
    let source = '';
    for (const c of cl) {
      const r = await fetchFeed(st.settings.apiBase, c.lat, c.lon, c.distNm, st.settings.source, AbortSignal.timeout(15000));
      serverNow = r.now ?? now;
      source = r.source ?? '';
      for (const a of r.ac ?? []) all.set(a.hex, a);
    }
    const real = normalize([...all.values()], serverNow, prevMap);
    prevMap = new Map(real.map((a) => [a.hex, a]));
    const aircraft = withDemo(real);
    st.setAircraft(aircraft);
    st.setFeed({
      status: 'ok',
      source,
      fetchedAt: Date.now(),
      serverNow,
      count: real.length,
      error: undefined,
      reason: undefined,
      clockSkew: Date.now() / 1000 - serverNow,
    });
    await recompute();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    st.setFeed({ status: 'error', error: /Failed to fetch|Load failed|NetworkError|timed out|abort/i.test(msg) ? 'E_OFFLINE' : msg });
  }
  schedule(nextInterval());
}

function nextInterval(): number {
  const st = useStore.getState();
  const now = Date.now() / 1000;
  const soon = (st.prediction?.passes ?? []).filter((p) => p.t > now - 2);
  if (soon.some((p) => p.t - now < 150)) return 4000;
  if (soon.some((p) => p.t - now < 420)) return 6000;
  if (st.feed.status === 'error') return Math.max(st.settings.refreshSec * 1000, 15000);
  return st.settings.refreshSec * 1000;
}

export async function recompute() {
  const st = useStore.getState();
  const sites = engineSites(st);
  if (!sites.length) return;
  const res = await runPredict(st.aircraft, sites, {
    now: Date.now() / 1000,
    horizonSec: st.settings.horizonMin * 60,
    minMoonAlt: st.settings.minMoonAlt,
    nearDeg: st.settings.nearDeg,
    corridorSiteId: st.activeSiteId,
    corridorRangeM: 45000,
  });
  useStore.getState().setPrediction(res);
}

export function refreshNow() {
  schedule(50);
}

async function ensureElevations() {
  const st = useStore.getState();
  for (const s of st.sites) {
    if (s.ground === null && !s.groundManual) {
      const e = await fetchElevation(s.lat, s.lon);
      if (e !== null) useStore.getState().updateSite(s.id, { ground: e });
    }
  }
}

let gpsWatch: number | null = null;
let lastGpsElev: { lat: number; lon: number; elev: number } | null = null;

function syncGps() {
  const st = useStore.getState();
  if (st.settings.useGps && gpsWatch === null && 'geolocation' in navigator) {
    gpsWatch = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        let ground: number | null = lastGpsElev?.elev ?? null;
        if (!lastGpsElev || distanceM(lat, lon, lastGpsElev.lat, lastGpsElev.lon) > 150) {
          const e = await fetchElevation(lat, lon);
          if (e !== null) {
            ground = e;
            lastGpsElev = { lat, lon, elev: e };
          }
        }
        useStore.getState().setGps({ lat, lon, acc: accuracy, ground, ts: Date.now() });
      },
      () => {
        useStore.getState().setGps(null);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    );
  } else if (!st.settings.useGps && gpsWatch !== null) {
    navigator.geolocation.clearWatch(gpsWatch);
    gpsWatch = null;
    useStore.getState().setGps(null);
  }
}

export function startFeed() {
  if (running) return;
  running = true;
  ensureElevations();
  syncGps();
  schedule(300);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule(150);
  });
  let prevSites = useStore.getState().sites;
  let prevSettings = useStore.getState().settings;
  let prevGps = useStore.getState().gps;
  let prevActive = useStore.getState().activeSiteId;
  useStore.subscribe((s) => {
    if (s.sites !== prevSites || s.settings !== prevSettings || s.gps !== prevGps || s.activeSiteId !== prevActive) {
      const sitesChanged = s.sites !== prevSites;
      const settingsChanged = s.settings !== prevSettings;
      prevSites = s.sites;
      prevSettings = s.settings;
      prevGps = s.gps;
      prevActive = s.activeSiteId;
      if (sitesChanged) ensureElevations();
      if (settingsChanged) syncGps();
      clearTimeout(recomputeTimer);
      recomputeTimer = setTimeout(() => {
        if (sitesChanged || settingsChanged) schedule(100);
        else recompute();
      }, 350);
    }
  });
}
