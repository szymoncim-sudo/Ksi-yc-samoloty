// Free, keyless, CORS-friendly web services.
const cacheGet = <T,>(k: string, maxAgeMs: number): T | null => {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > maxAgeMs) return null;
    return v as T;
  } catch {
    return null;
  }
};
const cacheSet = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* quota / private mode */
  }
};

/** Terrain elevation (m MSL), Copernicus DEM 90 m via Open-Meteo. */
export async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  const key = `elev:${lat.toFixed(4)},${lon.toFixed(4)}`;
  const c = cacheGet<number>(key, 365 * 86400000);
  if (c !== null) return c;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}`);
    const j = await r.json();
    const v = Array.isArray(j.elevation) ? Number(j.elevation[0]) : NaN;
    if (!isFinite(v)) return null;
    cacheSet(key, v);
    return v;
  } catch {
    return null;
  }
}

export interface GeoResult {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

function photonLabel(p: Record<string, string>): { name: string; detail: string } {
  const name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || p.county || 'Miejsce';
  const detail = [p.city && p.city !== name ? p.city : null, p.county, p.state, p.country].filter(Boolean).join(', ');
  return { name, detail };
}

export async function searchPlaces(q: string, near?: { lat: number; lon: number }, signal?: AbortSignal): Promise<GeoResult[]> {
  const bias = near ? `&lat=${near.lat.toFixed(2)}&lon=${near.lon.toFixed(2)}` : '';
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7${bias}`, { signal });
  const j = await r.json();
  const seen = new Set<string>();
  const out: GeoResult[] = [];
  for (const f of (j.features ?? []) as { properties: Record<string, string>; geometry: { coordinates: [number, number] } }[]) {
    const l = photonLabel(f.properties);
    const k = `${l.name}|${l.detail}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...l, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
  }
  return out;
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&limit=1`);
    const j = await r.json();
    const p = j.features?.[0]?.properties;
    if (!p) return null;
    const { name } = photonLabel(p);
    const city = p.city || p.town || p.village || p.county;
    return city && city !== name ? `${name}, ${city}` : name;
  } catch {
    return null;
  }
}

export interface CloudForecast {
  time: number[];
  total: number[];
  low: number[];
  mid: number[];
  high: number[];
}

export async function fetchClouds(lat: number, lon: number): Promise<CloudForecast | null> {
  const key = `clouds:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const c = cacheGet<CloudForecast>(key, 30 * 60000);
  if (c) return c;
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&past_days=1&forecast_days=3&timezone=GMT&timeformat=unixtime`,
    );
    const j = await r.json();
    const h = j.hourly;
    if (!h) return null;
    const v: CloudForecast = {
      time: h.time.map((t: number) => t * 1000),
      total: h.cloud_cover,
      low: h.cloud_cover_low,
      mid: h.cloud_cover_mid,
      high: h.cloud_cover_high,
    };
    cacheSet(key, v);
    return v;
  } catch {
    return null;
  }
}

export interface RouteInfo {
  airline: string | null;
  from: { code: string; city: string } | null;
  to: { code: string; city: string } | null;
}

const routeMem = new Map<string, RouteInfo | null>();

export async function fetchRoute(callsign: string): Promise<RouteInfo | null> {
  const cs = callsign.trim().toUpperCase();
  if (!/^[A-Z]{3}\d/.test(cs)) return null;
  if (routeMem.has(cs)) return routeMem.get(cs)!;
  try {
    const r = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`);
    const j = await r.json();
    const fr = j?.response?.flightroute;
    const info: RouteInfo | null = fr
      ? {
          airline: fr.airline?.name ?? null,
          from: fr.origin ? { code: fr.origin.iata_code || fr.origin.icao_code, city: fr.origin.municipality } : null,
          to: fr.destination ? { code: fr.destination.iata_code || fr.destination.icao_code, city: fr.destination.municipality } : null,
        }
      : null;
    routeMem.set(cs, info);
    return info;
  } catch {
    return null;
  }
}
