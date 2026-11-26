// Moon ephemeris, phases, events and 3D orientation – built on Astronomy Engine (MIT).
import * as A from 'astronomy-engine';
import { DEG, RAD, Vec3, wrap360 } from './geo';
import { refractionDeg } from './refraction';

export const MOON_RADIUS_KM = 1737.4;
export const EARTH_RADIUS_KM = 6378.137;
export const SUN_RADIUS_KM = 695700;
export const AU_KM = 149597870.7;
export const SYNODIC_DAYS = 29.530588853;

export interface Place {
  lat: number;
  lon: number;
  /** metres above mean sea level (eye height) */
  elev: number;
}

export const observerOf = (p: Place) => new A.Observer(p.lat, p.lon, p.elev);

export type PhaseKey =
  | 'new'
  | 'waxingCrescent'
  | 'firstQuarter'
  | 'waxingGibbous'
  | 'full'
  | 'waningGibbous'
  | 'lastQuarter'
  | 'waningCrescent';

export const QUARTER_KEYS: PhaseKey[] = ['new', 'firstQuarter', 'full', 'lastQuarter'];

export function phaseKeyFromLon(lon: number): PhaseKey {
  const w = 7.5;
  if (lon < w || lon >= 360 - w) return 'new';
  if (lon < 90 - w) return 'waxingCrescent';
  if (lon < 90 + w) return 'firstQuarter';
  if (lon < 180 - w) return 'waxingGibbous';
  if (lon < 180 + w) return 'full';
  if (lon < 270 - w) return 'waningGibbous';
  if (lon < 270 + w) return 'lastQuarter';
  return 'waningCrescent';
}

export interface MoonInfo {
  date: Date;
  alt: number;
  altGeo: number;
  az: number;
  ra: number;
  dec: number;
  distKm: number;
  geoDistKm: number;
  diamDeg: number;
  illum: number;
  phaseAngle: number;
  phaseLon: number;
  ageDays: number;
  waxing: boolean;
  phaseKey: PhaseKey;
  elongation: number;
  mag: number;
  constellation: string;
  sunAlt: number;
  sunAz: number;
  libLat: number;
  libLon: number;
  parallacticAngle: number;
}

export function moonInfo(date: Date, place: Place): MoonInfo {
  const obs = observerOf(place);
  const t = A.MakeTime(date);
  const eqd = A.Equator(A.Body.Moon, t, obs, true, true);
  const eqj = A.Equator(A.Body.Moon, t, obs, false, true);
  const hor = A.Horizon(t, obs, eqd.ra, eqd.dec);
  const altGeo = hor.altitude;
  const alt = altGeo + refractionDeg(altGeo, place.elev);
  const ill = A.Illumination(A.Body.Moon, t);
  const phaseLon = A.MoonPhase(t);
  const distKm = eqd.dist * AU_KM;
  const geo = A.GeoVector(A.Body.Moon, t, true);
  const geoDistKm = geo.Length() * AU_KM;
  let ageDays = (phaseLon / 360) * SYNODIC_DAYS;
  try {
    const prevNew = A.SearchMoonPhase(0, t, -40);
    if (prevNew) ageDays = (date.getTime() - prevNew.date.getTime()) / 86400000;
  } catch {
    /* keep approximation */
  }
  const sunEq = A.Equator(A.Body.Sun, t, obs, true, true);
  const sunHor = A.Horizon(t, obs, sunEq.ra, sunEq.dec);
  const lib = A.Libration(t);
  const cons = A.Constellation(eqj.ra, eqj.dec);
  // parallactic angle
  const lst = A.SiderealTime(t) + place.lon / 15;
  const H = (lst - eqd.ra) * 15 * DEG;
  const phi = place.lat * DEG;
  const dec = eqd.dec * DEG;
  const q = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(dec) - Math.sin(dec) * Math.cos(H)) * RAD;
  const key = phaseKeyFromLon(phaseLon);
  return {
    date,
    alt,
    altGeo,
    az: hor.azimuth,
    ra: eqd.ra,
    dec: eqd.dec,
    distKm,
    geoDistKm,
    diamDeg: 2 * Math.asin(MOON_RADIUS_KM / distKm) * RAD,
    illum: ill.phase_fraction,
    phaseAngle: ill.phase_angle,
    phaseLon,
    ageDays,
    waxing: phaseLon < 180,
    phaseKey: key,
    elongation: A.AngleFromSun(A.Body.Moon, t),
    mag: ill.mag,
    constellation: cons.name,
    sunAlt: sunHor.altitude,
    sunAz: sunHor.azimuth,
    libLat: lib.elat,
    libLon: lib.elon,
    parallacticAngle: q,
  };
}

/** Fast apparent altitude/azimuth of the Moon (deg). */
export function moonAltAz(date: Date, place: Place): { alt: number; az: number } {
  const obs = observerOf(place);
  const eq = A.Equator(A.Body.Moon, date, obs, true, true);
  const h = A.Horizon(date, obs, eq.ra, eq.dec);
  return { alt: h.altitude + refractionDeg(h.altitude, place.elev), az: h.azimuth };
}

/** Light-weight phase-only info (no observer). */
export function phaseAt(date: Date) {
  const t = A.MakeTime(date);
  const lon = A.MoonPhase(t);
  const ill = A.Illumination(A.Body.Moon, t);
  return { phaseLon: lon, illum: ill.phase_fraction, key: phaseKeyFromLon(lon) };
}

// ------------------------------------------------------------------------------------
// 3D geometry for the renderer (all vectors in J2000 equatorial frame, EQJ)
export interface MoonGeometry {
  /** columns: body x (lon 0), body y (lon 90E), body z (north) expressed in EQJ */
  bodyToEqj: number[];
  viewDir: Vec3;
  sunFromMoon: Vec3;
  zenith: Vec3;
  celestialNorth: Vec3;
  moonGeoKm: Vec3;
  sunGeoKm: Vec3;
  distKm: number;
}

const v3 = (v: A.Vector): Vec3 => [v.x, v.y, v.z];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function moonGeometry(date: Date, place: Place | null): MoonGeometry {
  const t = A.MakeTime(date);
  const axis = A.RotationAxis(A.Body.Moon, t);
  const ra0 = axis.ra * 15 * DEG;
  const n: Vec3 = norm(v3(axis.north));
  const Q: Vec3 = [-Math.sin(ra0), Math.cos(ra0), 0];
  const NxQ = cross(n, Q);
  const W = axis.spin * DEG;
  const cw = Math.cos(W), sw = Math.sin(W);
  const x: Vec3 = [Q[0] * cw + NxQ[0] * sw, Q[1] * cw + NxQ[1] * sw, Q[2] * cw + NxQ[2] * sw];
  const y: Vec3 = [-Q[0] * sw + NxQ[0] * cw, -Q[1] * sw + NxQ[1] * cw, -Q[2] * sw + NxQ[2] * cw];
  const moonGeo = scale(v3(A.GeoVector(A.Body.Moon, t, true)), AU_KM);
  const sunGeo = scale(v3(A.GeoVector(A.Body.Sun, t, true)), AU_KM);
  let obsVec: Vec3 = [0, 0, 0];
  let zenith: Vec3 = [0, 0, 1];
  if (place) {
    obsVec = scale(v3(A.ObserverVector(t, observerOf(place), false)), AU_KM);
    zenith = norm(obsVec);
  }
  const topo = sub(moonGeo, obsVec);
  return {
    bodyToEqj: [...x, ...y, ...n],
    viewDir: norm(topo),
    sunFromMoon: norm(sub(sunGeo, moonGeo)),
    zenith,
    celestialNorth: [0, 0, 1],
    moonGeoKm: moonGeo,
    sunGeoKm: sunGeo,
    distKm: Math.hypot(...topo),
  };
}

/** Sub-observer selenographic point (deg) – handy for tests and the info panel. */
export function subObserverPoint(g: MoonGeometry): { lat: number; lon: number } {
  const m = g.bodyToEqj;
  const d: Vec3 = scale(g.viewDir, -1);
  const bx = d[0] * m[0] + d[1] * m[1] + d[2] * m[2];
  const by = d[0] * m[3] + d[1] * m[4] + d[2] * m[5];
  const bz = d[0] * m[6] + d[1] * m[7] + d[2] * m[8];
  return { lat: Math.asin(bz) * RAD, lon: Math.atan2(by, bx) * RAD };
}

// ------------------------------------------------------------------------------------
// Sampler of the Moon's apparent position for the transit engine
export interface MoonSampler {
  t0: number;
  step: number;
  n: number;
  alt: Float64Array; // apparent (refracted), deg
  altGeo: Float64Array; // geometric, deg
  az: Float64Array; // unwrapped, deg
  radiusDeg: Float64Array;
  at(t: number, out?: { alt: number; altGeo: number; az: number; radius: number }): {
    alt: number;
    altGeo: number;
    az: number;
    radius: number;
  };
}

export function makeMoonSampler(place: Place, t0: number, durationSec: number, step = 20): MoonSampler {
  const obs = observerOf(place);
  const n = Math.ceil(durationSec / step) + 2;
  const alt = new Float64Array(n);
  const altGeo = new Float64Array(n);
  const az = new Float64Array(n);
  const radiusDeg = new Float64Array(n);
  let prevAz = 0;
  for (let i = 0; i < n; i++) {
    const t = A.MakeTime(new Date((t0 + i * step) * 1000));
    const eq = A.Equator(A.Body.Moon, t, obs, true, true);
    const hor = A.Horizon(t, obs, eq.ra, eq.dec);
    altGeo[i] = hor.altitude;
    alt[i] = hor.altitude + refractionDeg(hor.altitude, place.elev);
    let a = hor.azimuth;
    if (i > 0) {
      while (a - prevAz > 180) a -= 360;
      while (a - prevAz < -180) a += 360;
    }
    az[i] = a;
    prevAz = a;
    radiusDeg[i] = Math.asin(MOON_RADIUS_KM / (eq.dist * AU_KM)) * RAD;
  }
  const sampler: MoonSampler = {
    t0,
    step,
    n,
    alt,
    altGeo,
    az,
    radiusDeg,
    at(t, out = { alt: 0, altGeo: 0, az: 0, radius: 0 }) {
      let f = (t - t0) / step;
      if (f < 0) f = 0;
      if (f > n - 1.000001) f = n - 1.000001;
      const i = Math.floor(f);
      const u = f - i;
      out.alt = alt[i] + (alt[i + 1] - alt[i]) * u;
      out.altGeo = altGeo[i] + (altGeo[i + 1] - altGeo[i]) * u;
      out.az = wrap360(az[i] + (az[i + 1] - az[i]) * u);
      out.radius = radiusDeg[i] + (radiusDeg[i + 1] - radiusDeg[i]) * u;
      return out;
    },
  };
  return sampler;
}

// ------------------------------------------------------------------------------------
// Rise / set / altitude curves
export interface RiseSet {
  rise: Date | null;
  set: Date | null;
  culmination: { date: Date; alt: number } | null;
}

export function moonRiseSet(place: Place, dayStart: Date): RiseSet {
  const obs = observerOf(place);
  const r = A.SearchRiseSet(A.Body.Moon, obs, +1, dayStart, 1);
  const s = A.SearchRiseSet(A.Body.Moon, obs, -1, dayStart, 1);
  let culm: RiseSet['culmination'] = null;
  try {
    // the culmination of the night that starts with this day's moonrise (may fall after midnight)
    const from = r?.date ?? dayStart;
    const c = A.SearchHourAngle(A.Body.Moon, obs, 0, from, +1);
    if (c && c.time.date.getTime() - from.getTime() < 1.2 * 86400000) culm = { date: c.time.date, alt: c.hor.altitude };
  } catch {
    /* ignore */
  }
  return { rise: r?.date ?? null, set: s?.date ?? null, culmination: culm };
}

export function nextRiseSet(place: Place, from: Date) {
  const obs = observerOf(place);
  const r = A.SearchRiseSet(A.Body.Moon, obs, +1, from, 2);
  const s = A.SearchRiseSet(A.Body.Moon, obs, -1, from, 2);
  return { rise: r?.date ?? null, set: s?.date ?? null };
}

export interface AltCurve {
  t: number[];
  moon: number[];
  sun: number[];
}

export function altitudeCurve(place: Place, start: Date, hours: number, stepMin = 10): AltCurve {
  const obs = observerOf(place);
  const res: AltCurve = { t: [], moon: [], sun: [] };
  const n = Math.round((hours * 60) / stepMin);
  for (let i = 0; i <= n; i++) {
    const d = new Date(start.getTime() + i * stepMin * 60000);
    const t = A.MakeTime(d);
    const m = A.Equator(A.Body.Moon, t, obs, true, true);
    const s = A.Equator(A.Body.Sun, t, obs, true, true);
    res.t.push(d.getTime());
    res.moon.push(A.Horizon(t, obs, m.ra, m.dec).altitude);
    res.sun.push(A.Horizon(t, obs, s.ra, s.dec).altitude);
  }
  return res;
}

// ------------------------------------------------------------------------------------
// Events
export interface EclipseInfo {
  kind: 'penumbral' | 'partial' | 'total';
  peak: Date;
  obscuration: number;
  penStart: Date;
  penEnd: Date;
  parStart: Date | null;
  parEnd: Date | null;
  totStart: Date | null;
  totEnd: Date | null;
  altAtPeak: number | null;
  visible: boolean;
}

const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

function moonAltAt(place: Place, d: Date): number {
  const obs = observerOf(place);
  const eq = A.Equator(A.Body.Moon, d, obs, true, true);
  return A.Horizon(d, obs, eq.ra, eq.dec).altitude;
}

export function lunarEclipses(from: Date, count: number, place: Place | null): EclipseInfo[] {
  const res: EclipseInfo[] = [];
  let e = A.SearchLunarEclipse(from);
  for (let i = 0; i < count; i++) {
    const peak = e.peak.date;
    const kind = e.kind as EclipseInfo['kind'];
    const info: EclipseInfo = {
      kind,
      peak,
      obscuration: e.obscuration,
      penStart: addMin(peak, -e.sd_penum),
      penEnd: addMin(peak, e.sd_penum),
      parStart: e.sd_partial > 0 ? addMin(peak, -e.sd_partial) : null,
      parEnd: e.sd_partial > 0 ? addMin(peak, e.sd_partial) : null,
      totStart: e.sd_total > 0 ? addMin(peak, -e.sd_total) : null,
      totEnd: e.sd_total > 0 ? addMin(peak, e.sd_total) : null,
      altAtPeak: null,
      visible: false,
    };
    if (place) {
      info.altAtPeak = moonAltAt(place, peak);
      const sd = e.sd_partial > 0 ? e.sd_partial : e.sd_penum;
      info.visible = [-1, -0.5, 0, 0.5, 1].some((f) => moonAltAt(place, addMin(peak, f * sd)) > 0);
    }
    res.push(info);
    e = A.NextLunarEclipse(e.peak);
  }
  return res;
}

export type EventBadge = 'super' | 'micro' | 'blue' | 'blood' | 'eclipse';

export interface MoonEvent {
  id: string;
  type: 'quarter' | 'eclipse' | 'perigee' | 'apogee';
  date: Date;
  quarter?: number;
  phaseKey?: PhaseKey;
  badges: EventBadge[];
  distKm?: number;
  eclipse?: EclipseInfo;
}

export function moonQuarters(from: Date, count: number) {
  const res: { quarter: number; date: Date; distKm: number }[] = [];
  let mq = A.SearchMoonQuarter(from);
  for (let i = 0; i < count; i++) {
    const d = mq.time.date;
    res.push({ quarter: mq.quarter, date: d, distKm: A.GeoVector(A.Body.Moon, d, true).Length() * AU_KM });
    mq = A.NextMoonQuarter(mq);
  }
  return res;
}

export function upcomingEvents(from: Date, place: Place | null, months = 13): MoonEvent[] {
  const until = from.getTime() + months * 30.5 * 86400000;
  const events: MoonEvent[] = [];
  const quarters = moonQuarters(from, Math.ceil(months * 4.3) + 4);
  const fullByMonth = new Map<string, number>();
  for (const q of quarters) {
    if (q.date.getTime() > until) break;
    const badges: EventBadge[] = [];
    if (q.quarter === 2) {
      const mk = `${q.date.getFullYear()}-${q.date.getMonth()}`;
      const c = (fullByMonth.get(mk) ?? 0) + 1;
      fullByMonth.set(mk, c);
      if (q.distKm < 361500) badges.push('super');
      if (q.distKm > 404500) badges.push('micro');
      if (c === 2) badges.push('blue');
    }
    events.push({ id: `q-${q.date.getTime()}`, type: 'quarter', date: q.date, quarter: q.quarter, phaseKey: QUARTER_KEYS[q.quarter], badges, distKm: q.distKm });
  }
  for (const e of lunarEclipses(from, 3, place)) {
    if (e.peak.getTime() > until + 365 * 86400000) break;
    events.push({ id: `e-${e.peak.getTime()}`, type: 'eclipse', date: e.peak, badges: e.kind === 'total' ? ['eclipse', 'blood'] : ['eclipse'], eclipse: e });
  }
  let ap = A.SearchLunarApsis(from);
  while (ap.time.date.getTime() < until) {
    const peri = ap.kind === A.ApsisKind.Pericenter;
    events.push({ id: `a-${ap.time.date.getTime()}`, type: peri ? 'perigee' : 'apogee', date: ap.time.date, badges: [], distKm: ap.dist_km });
    ap = A.NextLunarApsis(ap);
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}

// ------------------------------------------------------------------------------------
// Eclipse diagram geometry (as seen from Earth's centre, degrees, x = east, y = north)
export interface EclipseDiagram {
  umbraR: number;
  penumbraR: number;
  moonR: number;
  track: { t: number; x: number; y: number }[];
}

export function eclipseDiagram(peak: Date, halfSpanMin: number, steps = 40): EclipseDiagram {
  const at = (d: Date) => {
    const t = A.MakeTime(d);
    const m = v3(A.GeoVector(A.Body.Moon, t, true));
    const s = v3(A.GeoVector(A.Body.Sun, t, true));
    return { m: scale(m, AU_KM), s: scale(s, AU_KM) };
  };
  const p = at(peak);
  const dm = Math.hypot(...p.m);
  const ds = Math.hypot(...p.s);
  const piM = Math.asin(EARTH_RADIUS_KM / dm) * RAD;
  const piS = Math.asin(EARTH_RADIUS_KM / ds) * RAD;
  const sS = Math.asin(SUN_RADIUS_KM / ds) * RAD;
  const umbraR = 1.02 * piM + piS - sS;
  const penumbraR = 1.02 * piM + piS + sS;
  const moonR = Math.asin(MOON_RADIUS_KM / dm) * RAD;
  const track: EclipseDiagram['track'] = [];
  for (let i = 0; i <= steps; i++) {
    const d = new Date(peak.getTime() + (-halfSpanMin + (2 * halfSpanMin * i) / steps) * 60000);
    const q = at(d);
    const a = norm(scale(q.s, -1));
    const m = norm(q.m);
    const north = norm(sub([0, 0, 1], scale(a, a[2])));
    const east = cross(north, a);
    const den = dot(m, a);
    track.push({ t: d.getTime(), x: (dot(m, east) / den) * RAD, y: (dot(m, north) / den) * RAD });
  }
  return { umbraR, penumbraR, moonR, track };
}

/** Earth-shadow parameters for the shader: radii in km at the Moon's distance along the axis. */
export function shadowParams(g: MoonGeometry) {
  const ds = Math.hypot(...g.sunGeoKm);
  const axis = norm(scale(g.sunGeoKm, -1));
  return { axis, sunDistKm: ds, earthR: EARTH_RADIUS_KM * 1.0128, sunR: SUN_RADIUS_KM };
}

/** Fraction of the Moon's disk inside the umbra (0..1), coarse – used for auto exposure. */
export function umbralDepth(g: MoonGeometry): number {
  const sp = shadowParams(g);
  const d = dot(g.moonGeoKm, sp.axis);
  if (d <= 0) return 0;
  const perp = sub(g.moonGeoKm, scale(sp.axis, d));
  const r = Math.hypot(...perp);
  const ru = sp.earthR - (d * (sp.sunR - sp.earthR)) / sp.sunDistKm;
  const x = (ru - r) / MOON_RADIUS_KM; // >1 fully inside
  return Math.min(1, Math.max(0, (x + 1) / 2));
}
