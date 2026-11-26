// Tiny ADS-B proxy shared by the Vite dev server, the Electron app and the Cloudflare Worker.
// Live aircraft APIs (adsb.fi, adsb.lol) don't send CORS headers, so a browser/PWA cannot call
// them directly. This module fetches upstream, slims the payload and returns JSON with CORS.

const UPSTREAMS = {
  adsbfi: (lat, lon, dist) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
  adsblol: (lat, lon, dist) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${dist}`,
  opensky: (lat, lon, dist) => {
    const dLat = (dist * 1.852) / 111.32;
    const dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    return `https://opensky-network.org/api/states/all?lamin=${(lat - dLat).toFixed(3)}&lomin=${(lon - dLon).toFixed(3)}&lamax=${(lat + dLat).toFixed(3)}&lomax=${(lon + dLon).toFixed(3)}&extended=1`;
  },
};

// OpenSky aircraft category index → ADS-B emitter category
const OS_CAT = { 2: 'A1', 3: 'A2', 4: 'A3', 5: 'A4', 6: 'A5', 7: 'A6', 8: 'A7', 9: 'B1', 10: 'B2' };

/** OpenSky state vectors → readsb-like records */
function fromOpenSky(json) {
  const now = num(json.time, Date.now() / 1000);
  const ac = [];
  for (const s of json.states || []) {
    const [icao, cs, , tpos, , lon, lat, baro, onGround, vel, trk, vr, , geo, sq, , , cat] = s;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const o = { hex: icao, flight: cs || '', lat, lon, seen_pos: tpos ? Math.max(0, now - tpos) : 30 };
    if (onGround) o.alt_baro = 'ground';
    else if (typeof baro === 'number') o.alt_baro = Math.round(baro / 0.3048);
    if (typeof geo === 'number') o.alt_geom = Math.round(geo / 0.3048);
    if (typeof vel === 'number') o.gs = vel / 0.514444;
    if (typeof trk === 'number') o.track = trk;
    if (typeof vr === 'number') o.baro_rate = vr / 0.00508;
    if (sq) o.squawk = sq;
    if (OS_CAT[cat]) o.category = OS_CAT[cat];
    ac.push(o);
  }
  return { now, ac };
}

/** Preferred upstream order for `src=auto` (the Cloudflare Worker overrides it: adsb.fi refuses cloud IPs). */
export const DEFAULT_ORDER = ['adsbfi', 'adsblol', 'opensky'];

const KEEP = [
  'hex', 'flight', 'r', 't', 'desc', 'category', 'lat', 'lon', 'alt_baro', 'alt_geom', 'gs', 'track',
  'true_heading', 'track_rate', 'baro_rate', 'geom_rate', 'seen_pos', 'squawk', 'dbFlags',
];

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function parseParams(searchParams) {
  const lat = Math.max(-90, Math.min(90, Math.round(num(searchParams.get('lat'), 0) * 100) / 100));
  const lon = Math.max(-180, Math.min(180, Math.round(num(searchParams.get('lon'), 0) * 100) / 100));
  const dist = Math.max(5, Math.min(250, Math.round(num(searchParams.get('dist'), 120))));
  const src = String(searchParams.get('src') || 'auto');
  return { lat, lon, dist, src };
}

async function fetchOne(name, lat, lon, dist, fetchImpl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetchImpl(UPSTREAMS[name](lat, lon, dist), {
      headers: { accept: 'application/json', 'user-agent': 'Lunaris/1.0 (lunar transit predictor)' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const json = await res.json();
    if (name === 'opensky') return { ok: true, source: name, ...fromOpenSky(json) };
    const list = Array.isArray(json.ac) ? json.ac : Array.isArray(json.aircraft) ? json.aircraft : [];
    let now = num(json.now, Date.now() / 1000);
    if (now > 1e12) now /= 1000;
    const ac = [];
    for (const a of list) {
      if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
      const o = {};
      for (const k of KEEP) if (a[k] !== undefined) o[k] = a[k];
      ac.push(o);
    }
    const quota = res.headers.get('x-ratelimit-remaining');
    return quota !== null ? { ok: true, source: name, now, quota: Number(String(quota).split(',')[0]), ac } : { ok: true, source: name, now, ac };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFlights({ lat, lon, dist, src }, fetchImpl = fetch, defaultOrder = DEFAULT_ORDER) {
  if (src === 'both') {
    const rs = await Promise.allSettled([fetchOne('adsbfi', lat, lon, dist, fetchImpl), fetchOne('adsblol', lat, lon, dist, fetchImpl)]);
    const ok = rs.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!ok.length) return { ok: false, error: rs.map((r) => String(r.reason && r.reason.message ? r.reason.message : r.reason)).join('; ') };
    const now = Math.max(...ok.map((r) => r.now));
    const byHex = new Map();
    for (const r of ok) {
      for (const a of r.ac) {
        const age = (a.seen_pos ?? 0) + (now - r.now);
        const prev = byHex.get(a.hex);
        if (!prev || age < prev.age) byHex.set(a.hex, { age, a: { ...a, seen_pos: age } });
      }
    }
    return { ok: true, source: ok.map((r) => r.source).join('+'), now, ac: [...byHex.values()].map((x) => x.a) };
  }
  const order = UPSTREAMS[src] ? [src, ...defaultOrder.filter((n) => n !== src)] : defaultOrder;
  const errors = [];
  for (const name of order) {
    try {
      const r = await fetchOne(name, lat, lon, dist, fetchImpl);
      if (errors.length) r.fallbackFrom = errors;
      return r;
    } catch (e) {
      errors.push(String(e && e.message ? e.message : e));
    }
  }
  return { ok: false, error: errors.join('; ') };
}

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

/** Generic handler → { status, body } */
export async function handleFlights(searchParams, fetchImpl = fetch, defaultOrder = DEFAULT_ORDER) {
  const p = parseParams(searchParams);
  const r = await fetchFlights(p, fetchImpl, defaultOrder);
  return { status: r.ok ? 200 : 502, body: JSON.stringify(r) };
}
