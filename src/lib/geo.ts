// WGS84 geodesy helpers (ECEF / ENU / geodetic) + small-distance spherical helpers.
import { GEOID_B64, GEOID_COLS, GEOID_ROWS } from './geoidGrid';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export type Vec3 = [number, number, number];

const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const B = A * (1 - F);
const EP2 = (A * A - B * B) / (B * B);
export const R_MEAN = 6371008.8;

export function geodeticToEcef(latDeg: number, lonDeg: number, h: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const sl = Math.sin(lat);
  const cl = Math.cos(lat);
  const N = A / Math.sqrt(1 - E2 * sl * sl);
  out[0] = (N + h) * cl * Math.cos(lon);
  out[1] = (N + h) * cl * Math.sin(lon);
  out[2] = (N * (1 - E2) + h) * sl;
  return out;
}

/** Bowring's method – sub-millimetre for terrestrial/aviation heights. */
export function ecefToGeodetic(x: number, y: number, z: number): { lat: number; lon: number; h: number } {
  const p = Math.hypot(x, y);
  const th = Math.atan2(z * A, p * B);
  const st = Math.sin(th);
  const ct = Math.cos(th);
  const lat = Math.atan2(z + EP2 * B * st * st * st, p - E2 * A * ct * ct * ct);
  const lon = Math.atan2(y, x);
  const sl = Math.sin(lat);
  const N = A / Math.sqrt(1 - E2 * sl * sl);
  const cl = Math.cos(lat);
  const h = Math.abs(cl) > 1e-9 ? p / cl - N : Math.abs(z) / Math.abs(sl) - N * (1 - E2);
  return { lat: lat * RAD, lon: lon * RAD, h };
}

export interface EnuFrame {
  lat: number;
  lon: number;
  h: number;
  origin: Vec3;
  e: Vec3;
  n: Vec3;
  u: Vec3;
}

export function enuFrame(latDeg: number, lonDeg: number, h: number): EnuFrame {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  return {
    lat: latDeg,
    lon: lonDeg,
    h,
    origin: geodeticToEcef(latDeg, lonDeg, h),
    e: [-so, co, 0],
    n: [-sl * co, -sl * so, cl],
    u: [cl * co, cl * so, sl],
  };
}

export function toEnu(f: EnuFrame, p: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
  const dx = p[0] - f.origin[0], dy = p[1] - f.origin[1], dz = p[2] - f.origin[2];
  out[0] = dx * f.e[0] + dy * f.e[1] + dz * f.e[2];
  out[1] = dx * f.n[0] + dy * f.n[1] + dz * f.n[2];
  out[2] = dx * f.u[0] + dy * f.u[1] + dz * f.u[2];
  return out;
}

/** ENU direction (unit) → ECEF direction (unit). */
export function enuDirToEcef(f: EnuFrame, d: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
  out[0] = d[0] * f.e[0] + d[1] * f.n[0] + d[2] * f.u[0];
  out[1] = d[0] * f.e[1] + d[1] * f.n[1] + d[2] * f.u[1];
  out[2] = d[0] * f.e[2] + d[1] * f.n[2] + d[2] * f.u[2];
  return out;
}

/** alt/az (deg) → ENU unit vector. Azimuth from north, clockwise (east = 90). */
export function altAzToEnu(altDeg: number, azDeg: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const a = altDeg * DEG, z = azDeg * DEG;
  const ca = Math.cos(a);
  out[0] = ca * Math.sin(z);
  out[1] = ca * Math.cos(z);
  out[2] = Math.sin(a);
  return out;
}

/** Spherical destination point (good to metres for <500 km). */
export function destination(latDeg: number, lonDeg: number, bearingDeg: number, distM: number): [number, number] {
  const d = distM / R_MEAN;
  const b = bearingDeg * DEG;
  const la1 = latDeg * DEG;
  const lo1 = lonDeg * DEG;
  const sla1 = Math.sin(la1), cla1 = Math.cos(la1), sd = Math.sin(d), cd = Math.cos(d);
  const la2 = Math.asin(sla1 * cd + cla1 * sd * Math.cos(b));
  const lo2 = lo1 + Math.atan2(Math.sin(b) * sd * cla1, cd - sla1 * Math.sin(la2));
  return [la2 * RAD, ((lo2 * RAD + 540) % 360) - 180];
}

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * DEG, p2 = lat2 * DEG;
  const dp = p2 - p1, dl = (lon2 - lon1) * DEG;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_MEAN * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * RAD + 360) % 360;
}

/** Local metric offset (east,north metres) → lat/lon. */
export function offsetLatLon(lat: number, lon: number, eM: number, nM: number): [number, number] {
  const dLat = (nM / R_MEAN) * RAD;
  const dLon = (eM / (R_MEAN * Math.cos(lat * DEG))) * RAD;
  return [lat + dLat, lon + dLon];
}

/** Geodesic circle polygon (lon,lat pairs) for map display. */
export function circlePolygon(lat: number, lon: number, radiusM: number, n = 96): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const [la, lo] = destination(lat, lon, (i / n) * 360, radiusM);
    pts.push([lo, la]);
  }
  return pts;
}

// ---- EGM96 geoid undulation (2° grid, bilinear) ----
let geoid: Int16Array | null = null;
function geoidData(): Int16Array {
  if (!geoid) {
    const bin = atob(GEOID_B64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    geoid = new Int16Array(bytes.buffer);
  }
  return geoid;
}

/** Geoid height N (m): ellipsoidal height = MSL height + N. */
export function geoidUndulation(lat: number, lon: number): number {
  const g = geoidData();
  const r = Math.min(Math.max((90 - lat) / 2, 0), GEOID_ROWS - 1.0001);
  let c = (((lon + 180) % 360) + 360) % 360 / 2;
  const r0 = Math.floor(r), c0 = Math.floor(c);
  const fr = r - r0, fc = c - c0;
  const c1 = (c0 + 1) % GEOID_COLS;
  const v = (rr: number, cc: number) => g[rr * GEOID_COLS + cc] / 10;
  const top = v(r0, c0) * (1 - fc) + v(r0, c1) * fc;
  const bot = v(r0 + 1, c0) * (1 - fc) + v(r0 + 1, c1) * fc;
  return top * (1 - fr) + bot * fr;
}

export function wrap180(a: number): number {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

export function wrap360(a: number): number {
  return ((a % 360) + 360) % 360;
}
