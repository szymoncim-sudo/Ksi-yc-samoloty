// Client side of the live ADS-B feed: fetch through the proxy and normalise readsb JSON.
import { geoidUndulation, wrap180 } from './geo';
import type { Aircraft } from './transit';

export interface RawAc {
  hex: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  category?: string;
  lat: number;
  lon: number;
  alt_baro?: number | 'ground';
  alt_geom?: number;
  gs?: number;
  track?: number;
  true_heading?: number;
  track_rate?: number;
  baro_rate?: number;
  geom_rate?: number;
  seen_pos?: number;
  squawk?: string;
  dbFlags?: number;
}

export interface FeedResponse {
  ok: boolean;
  source?: string;
  now?: number;
  ac?: RawAc[];
  error?: string;
}

export type FeedSource = 'auto' | 'both' | 'adsbfi' | 'adsblol';

export async function fetchFeed(apiBase: string, lat: number, lon: number, distNm: number, src: FeedSource, signal?: AbortSignal): Promise<FeedResponse> {
  const base = apiBase.replace(/\/+$/, '');
  const url = `${base}/api/flights?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&dist=${Math.round(distNm)}&src=${src}`;
  const res = await fetch(url, { signal, cache: 'no-store' });
  const text = await res.text();
  let json: FeedResponse;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(res.ok ? 'E_BAD' : `E_HTTP_${res.status}`);
  }
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

const FT = 0.3048;

/** Normalise raw aircraft. `prev` (last snapshot) lets us estimate turn rates if not broadcast. */
export function normalize(list: RawAc[], serverNow: number, prev: Map<string, Aircraft>): Aircraft[] {
  // regional baro → geometric correction (median of aircraft with both values)
  const pairs: { baro: number; diff: number }[] = [];
  for (const a of list) {
    if (typeof a.alt_baro === 'number' && typeof a.alt_geom === 'number') pairs.push({ baro: a.alt_baro, diff: a.alt_geom - a.alt_baro });
  }
  const corrFor = (baro: number): number | null => {
    const near = pairs.filter((p) => Math.abs(p.baro - baro) < 4000).map((p) => p.diff);
    if (near.length < 3) return null;
    near.sort((x, y) => x - y);
    return near[Math.floor(near.length / 2)];
  };

  const out: Aircraft[] = [];
  for (const a of list) {
    if (a.alt_baro === 'ground') continue;
    if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
    const seen = a.seen_pos ?? 0;
    if (seen > 25) continue;
    const baro = typeof a.alt_baro === 'number' ? a.alt_baro : null;
    if (baro === null && typeof a.alt_geom !== 'number') continue;
    let hEll: number;
    let altSource: Aircraft['altSource'];
    if (typeof a.alt_geom === 'number') {
      hEll = a.alt_geom * FT;
      altSource = 'geom';
    } else {
      const c = corrFor(baro!);
      if (c !== null) {
        hEll = (baro! + c) * FT;
        altSource = 'baro+corr';
      } else {
        hEll = baro! * FT + geoidUndulation(a.lat, a.lon);
        altSource = 'baro';
      }
    }
    const track = typeof a.track === 'number' ? a.track : typeof a.true_heading === 'number' ? a.true_heading : NaN;
    if (!isFinite(track)) continue;
    const tPos = serverNow - seen;
    let trackRate = typeof a.track_rate === 'number' ? a.track_rate : NaN;
    const p = prev.get(a.hex);
    if (!isFinite(trackRate)) {
      trackRate = 0;
      if (p && tPos - p.tPos > 2 && tPos - p.tPos < 60) {
        const r = wrap180(track - p.track) / (tPos - p.tPos);
        if (Math.abs(r) > 0.15) trackRate = Math.max(-4, Math.min(4, r));
      }
    }
    const vr = typeof a.geom_rate === 'number' ? a.geom_rate : typeof a.baro_rate === 'number' ? a.baro_rate : 0;
    out.push({
      hex: a.hex,
      callsign: (a.flight || '').trim(),
      reg: a.r || '',
      type: a.t || '',
      desc: a.desc || '',
      category: a.category || '',
      lat: a.lat,
      lon: a.lon,
      hEll,
      altFt: baro ?? Math.round(hEll / FT),
      altSource,
      gs: (a.gs ?? 0) * 0.514444,
      track,
      trackRate,
      vRate: (vr * FT) / 60,
      tPos,
      squawk: a.squawk || '',
      mil: !!((a.dbFlags ?? 0) & 1),
    });
  }
  return out;
}

/** Dead-reckoned position for smooth map animation. */
export function extrapolate(ac: Aircraft, t: number): [number, number] {
  const d = ac.gs * (t - ac.tPos);
  const R = 6371008.8;
  const br = (ac.track * Math.PI) / 180;
  const la1 = (ac.lat * Math.PI) / 180;
  const lo1 = (ac.lon * Math.PI) / 180;
  const dr = d / R;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(dr) + Math.cos(la1) * Math.sin(dr) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(la1), Math.cos(dr) - Math.sin(la1) * Math.sin(la2));
  return [(lo2 * 180) / Math.PI, (la2 * 180) / Math.PI];
}
