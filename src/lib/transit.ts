// Lunar transit prediction engine.
//
// For every aircraft the trajectory is dead-reckoned (great circle, optional decaying turn and
// climb rates). For every observing site the apparent direction of the aircraft (with the part of
// atmospheric refraction that applies to a target inside the atmosphere) is compared with the
// apparent topocentric Moon. Closest approach is found on a coarse grid and refined by golden
// section search. The "moon shadow" centre line of each aircraft – the locus of ground points
// from which the aircraft is exactly centred on the Moon – is computed by projecting the
// aircraft along the Moon ray onto the site's height above the WGS84 ellipsoid.
import { typeInfo } from './aircraft';
import { Place, makeMoonSampler, MoonSampler } from './astro';
import {
  DEG,
  RAD,
  Vec3,
  altAzToEnu,
  destination,
  ecefToGeodetic,
  enuDirToEcef,
  enuFrame,
  EnuFrame,
  geodeticToEcef,
  toEnu,
  wrap180,
} from './geo';
import { refractionDeg, refractionFraction } from './refraction';

export interface Aircraft {
  hex: string;
  callsign: string;
  reg: string;
  type: string;
  desc: string;
  category: string;
  lat: number;
  lon: number;
  /** height above the WGS84 ellipsoid (m) */
  hEll: number;
  /** barometric altitude for display (ft) */
  altFt: number;
  altSource: 'geom' | 'baro+corr' | 'baro';
  /** ground speed m/s */
  gs: number;
  track: number;
  /** deg/s, + = right turn */
  trackRate: number;
  /** m/s */
  vRate: number;
  /** unix seconds of the position */
  tPos: number;
  squawk: string;
  mil: boolean;
}

export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** eye height above mean sea level (m) */
  elevMsl: number;
  /** eye height above the WGS84 ellipsoid (m) */
  hEll: number;
  /** how far the observer can move (m) */
  reachM: number;
}

export interface Move {
  distM: number;
  bearing: number;
  lat: number;
  lon: number;
  tCenter: number;
  halfWidthM: number;
  perpM: number;
}

export interface Pass {
  key: string;
  siteId: string;
  hex: string;
  kind: 'transit' | 'near' | 'reach';
  t: number;
  sepDeg: number;
  moonRadiusDeg: number;
  durationSec: number;
  rangeM: number;
  acHeightM: number;
  elevDeg: number;
  azDeg: number;
  moonAlt: number;
  moonAz: number;
  relRateDegS: number;
  pathAngle: number;
  offX: number;
  offY: number;
  path: { dt: number; x: number; y: number }[];
  angularSpanArcmin: number;
  sigmaM: number;
  probability: number;
  move: Move | null;
}

export interface CorridorPoint {
  lat: number;
  lon: number;
  t: number;
  w: number;
}

export interface Corridor {
  key: string;
  hex: string;
  siteId: string;
  pts: CorridorPoint[];
  highlight: boolean;
}

export interface PredictOptions {
  now: number;
  horizonSec: number;
  minMoonAlt: number;
  nearDeg: number;
  step?: number;
  /** compute the full-window shadow corridors for this site id (map display) */
  corridorSiteId?: string | null;
  corridorRangeM?: number;
}

export interface PredictResult {
  passes: Pass[];
  corridors: Corridor[];
  tracks: Record<string, [number, number][]>;
  moonUp: Record<string, boolean>;
  computedAt: number;
  ms: number;
}

// ---------------------------------------------------------------------------------------------
// trajectory

interface Traj {
  t0: number;
  step: number;
  n: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  h: Float64Array;
}

const TAU_TURN = 75;
const TAU_V = 140;
const H_MAX = 15000;

function stateAt(ac: Aircraft, e: number): { lat: number; lon: number; h: number } {
  const w0 = Math.max(-6, Math.min(6, ac.trackRate || 0));
  const vr = ac.vRate || 0;
  let h = ac.hEll + vr * TAU_V * (1 - Math.exp(-Math.max(e, 0) / TAU_V));
  if (e < 0) h = ac.hEll + vr * e;
  h = Math.min(Math.max(h, -100), H_MAX);
  if (Math.abs(w0) < 0.04 || e <= 0) {
    const [lat, lon] = destination(ac.lat, ac.lon, ac.track, ac.gs * e);
    return { lat, lon, h };
  }
  // integrate a decaying turn with 1 s sub-steps
  let lat = ac.lat, lon = ac.lon;
  const sub = Math.max(1, Math.ceil(e));
  const dt = e / sub;
  for (let i = 0; i < sub; i++) {
    const em = (i + 0.5) * dt;
    const trk = ac.track + w0 * TAU_TURN * (1 - Math.exp(-em / TAU_TURN));
    [lat, lon] = destination(lat, lon, trk, ac.gs * dt);
  }
  return { lat, lon, h };
}

function propagate(ac: Aircraft, t0: number, n: number, step: number): Traj {
  const tr: Traj = {
    t0,
    step,
    n,
    x: new Float64Array(n),
    y: new Float64Array(n),
    z: new Float64Array(n),
    lat: new Float64Array(n),
    lon: new Float64Array(n),
    h: new Float64Array(n),
  };
  const turning = Math.abs(ac.trackRate || 0) >= 0.04;
  const tmp: Vec3 = [0, 0, 0];
  if (!turning) {
    for (let k = 0; k < n; k++) {
      const s = stateAt(ac, t0 + k * step - ac.tPos);
      geodeticToEcef(s.lat, s.lon, s.h, tmp);
      tr.x[k] = tmp[0]; tr.y[k] = tmp[1]; tr.z[k] = tmp[2];
      tr.lat[k] = s.lat; tr.lon[k] = s.lon; tr.h[k] = s.h;
    }
    return tr;
  }
  // incremental integration for turning aircraft
  const w0 = Math.max(-6, Math.min(6, ac.trackRate));
  const e0 = t0 - ac.tPos;
  const s0 = stateAt(ac, e0);
  let lat = s0.lat, lon = s0.lon;
  for (let k = 0; k < n; k++) {
    const e = e0 + k * step;
    if (k > 0) {
      const subN = Math.max(1, Math.round(step));
      const dt = step / subN;
      for (let i = 0; i < subN; i++) {
        const em = Math.max(0, e - step + (i + 0.5) * dt);
        const trk = ac.track + w0 * TAU_TURN * (1 - Math.exp(-em / TAU_TURN));
        [lat, lon] = destination(lat, lon, trk, ac.gs * dt);
      }
    }
    const h = Math.min(Math.max(ac.hEll + (ac.vRate || 0) * TAU_V * (1 - Math.exp(-Math.max(e, 0) / TAU_V)), -100), H_MAX);
    geodeticToEcef(lat, lon, h, tmp);
    tr.x[k] = tmp[0]; tr.y[k] = tmp[1]; tr.z[k] = tmp[2];
    tr.lat[k] = lat; tr.lon[k] = lon; tr.h[k] = h;
  }
  return tr;
}

function trajAt(tr: Traj, t: number, out: Vec3): number {
  let f = (t - tr.t0) / tr.step;
  if (f < 0) f = 0;
  if (f > tr.n - 1.000001) f = tr.n - 1.000001;
  const i = Math.floor(f);
  const u = f - i;
  out[0] = tr.x[i] + (tr.x[i + 1] - tr.x[i]) * u;
  out[1] = tr.y[i] + (tr.y[i + 1] - tr.y[i]) * u;
  out[2] = tr.z[i] + (tr.z[i + 1] - tr.z[i]) * u;
  return tr.h[i] + (tr.h[i + 1] - tr.h[i]) * u;
}

// ---------------------------------------------------------------------------------------------
// geometry helpers

function angSep(alt1: number, az1: number, alt2: number, az2: number): number {
  const a1 = alt1 * DEG, a2 = alt2 * DEG;
  const dAlt = a2 - a1;
  const dAz = wrap180(az2 - az1) * DEG;
  const s = Math.sin(dAlt / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dAz / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(s))) * RAD;
}

function normCdf(x: number): number {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function hitProbability(perpM: number, halfWidthM: number, sigmaM: number): number {
  const s = Math.max(sigmaM, 1);
  return Math.max(0, Math.min(1, normCdf((halfWidthM - perpM) / s) - normCdf((-halfWidthM - perpM) / s)));
}

interface SiteCtx {
  site: Site;
  frame: EnuFrame;
  moon: MoonSampler;
  place: Place;
}

interface LookResult {
  sep: number;
  el: number;
  az: number;
  r: number;
  dh: number;
  mAlt: number;
  mAz: number;
  mR: number;
}

const tmpP: Vec3 = [0, 0, 0];
const tmpE: Vec3 = [0, 0, 0];
const mTmp = { alt: 0, altGeo: 0, az: 0, radius: 0 };

function look(ctx: SiteCtx, tr: Traj, t: number, out: LookResult): LookResult {
  const h = trajAt(tr, t, tmpP);
  toEnu(ctx.frame, tmpP, tmpE);
  const r = Math.hypot(tmpE[0], tmpE[1], tmpE[2]);
  const el = Math.asin(tmpE[2] / r) * RAD;
  const az = (Math.atan2(tmpE[0], tmpE[1]) * RAD + 360) % 360;
  const dh = h - ctx.site.hEll;
  const elApp = el + refractionDeg(el, ctx.site.elevMsl) * refractionFraction(dh);
  ctx.moon.at(t, mTmp);
  out.sep = angSep(elApp, az, mTmp.alt, mTmp.az);
  out.el = elApp;
  out.az = az;
  out.r = r;
  out.dh = dh;
  out.mAlt = mTmp.alt;
  out.mAz = mTmp.az;
  out.mR = mTmp.radius;
  return out;
}

function offsetXY(l: LookResult): [number, number] {
  return [wrap180(l.az - l.mAz) * Math.cos(l.mAlt * DEG), l.el - l.mAlt];
}

// ground projection of the aircraft along the (refraction-adjusted) Moon ray
function shadowPoint(ctx: SiteCtx, tr: Traj, t: number): { lat: number; lon: number; D: number; alt: number; az: number; rho: number } | null {
  const hA = trajAt(tr, t, tmpP);
  const m = ctx.moon.at(t, { alt: 0, altGeo: 0, az: 0, radius: 0 });
  const dh = hA - ctx.site.hEll;
  if (dh < 50) return null;
  const altEff = m.altGeo + (1 - refractionFraction(dh)) * refractionDeg(m.altGeo, ctx.site.elevMsl);
  if (altEff < 1.5) return null;
  const dir = enuDirToEcef(ctx.frame, altAzToEnu(altEff, m.az));
  const sinA = Math.sin(altEff * DEG);
  let s = dh / sinA;
  let g = { lat: 0, lon: 0, h: 0 };
  for (let i = 0; i < 4; i++) {
    g = ecefToGeodetic(tmpP[0] - s * dir[0], tmpP[1] - s * dir[1], tmpP[2] - s * dir[2]);
    const err = g.h - ctx.site.hEll;
    s += err / sinA;
    if (Math.abs(err) < 0.05) break;
  }
  g = ecefToGeodetic(tmpP[0] - s * dir[0], tmpP[1] - s * dir[1], tmpP[2] - s * dir[2]);
  return { lat: g.lat, lon: g.lon, D: s, alt: altEff, az: m.az, rho: m.radius * DEG };
}

function corridor(ctx: SiteCtx, tr: Traj, tA: number, tB: number, step: number): CorridorPoint[] {
  const raw: { lat: number; lon: number; t: number; D: number; alt: number; az: number; rho: number }[] = [];
  for (let t = tA; t <= tB + 1e-6; t += step) {
    const p = shadowPoint(ctx, tr, t);
    if (p) raw.push({ ...p, t });
  }
  const pts: CorridorPoint[] = [];
  const kLat = 110540;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[Math.max(0, i - 1)];
    const b = raw[Math.min(raw.length - 1, i + 1)];
    const kLon = 111320 * Math.cos(raw[i].lat * DEG);
    let gx = (b.lon - a.lon) * kLon;
    let gy = (b.lat - a.lat) * kLat;
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl; gy /= gl;
    const px = -gy, py = gx;
    const az = raw[i].az * DEG;
    const cx = Math.cos(az), cy = -Math.sin(az);
    const hx = Math.sin(az), hy = Math.cos(az);
    const rd = raw[i].rho * raw[i].D;
    const pc = px * cx + py * cy;
    const ph = (px * hx + py * hy) / Math.sin(raw[i].alt * DEG);
    pts.push({ lat: raw[i].lat, lon: raw[i].lon, t: raw[i].t, w: rd * Math.sqrt(pc * pc + ph * ph) });
  }
  return pts;
}

function nearestOnCorridor(site: Site, pts: CorridorPoint[]): Move | null {
  if (pts.length < 2) return null;
  const kLat = 110540;
  const kLon = 111320 * Math.cos(site.lat * DEG);
  let best: Move | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = (pts[i].lon - site.lon) * kLon, ay = (pts[i].lat - site.lat) * kLat;
    const bx = (pts[i + 1].lon - site.lon) * kLon, by = (pts[i + 1].lat - site.lat) * kLat;
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let u = L2 > 0 ? -(ax * dx + ay * dy) / L2 : 0;
    u = Math.max(0, Math.min(1, u));
    const qx = ax + dx * u, qy = ay + dy * u;
    const d = Math.hypot(qx, qy);
    if (!best || d < best.distM) {
      best = {
        distM: d,
        bearing: (Math.atan2(qx, qy) * RAD + 360) % 360,
        lat: site.lat + qy / kLat,
        lon: site.lon + qx / kLon,
        tCenter: pts[i].t + (pts[i + 1].t - pts[i].t) * u,
        halfWidthM: pts[i].w + (pts[i + 1].w - pts[i].w) * u,
        perpM: d,
      };
    }
  }
  return best;
}

function sigmaFor(ac: Aircraft, lead: number, moonAlt: number): number {
  const L = Math.max(0, lead);
  let s = 35 + 0.55 * L;
  if (Math.abs(ac.trackRate) > 0.08) s += 3.5 * L;
  if (Math.abs(ac.vRate) > 1.5) s += 1.2 * L;
  const altErr = ac.altSource === 'geom' ? 15 : ac.altSource === 'baro+corr' ? 45 : 160;
  const altGround = altErr / Math.tan(Math.max(moonAlt, 3) * DEG);
  return Math.min(5000, Math.hypot(s, altGround));
}

// ---------------------------------------------------------------------------------------------

export function predict(aircraft: Aircraft[], sites: Site[], opts: PredictOptions): PredictResult {
  const started = performance.now();
  const step = opts.step ?? 2;
  const now = opts.now;
  const n = Math.ceil(opts.horizonSec / step) + 1;
  const ctxs: SiteCtx[] = sites.map((site) => ({
    site,
    frame: enuFrame(site.lat, site.lon, site.hEll),
    place: { lat: site.lat, lon: site.lon, elev: site.elevMsl },
    moon: makeMoonSampler({ lat: site.lat, lon: site.lon, elev: site.elevMsl }, now - 10, opts.horizonSec + 40, 20),
  }));
  const moonUp: Record<string, boolean> = {};
  for (const c of ctxs) {
    let up = false;
    for (let i = 0; i < c.moon.n; i++) if (c.moon.alt[i] >= opts.minMoonAlt) up = true;
    moonUp[c.site.id] = up;
  }
  const passes: Pass[] = [];
  const corridors: Corridor[] = [];
  const tracks: Record<string, [number, number][]> = {};
  const lr: LookResult = { sep: 0, el: 0, az: 0, r: 0, dh: 0, mAlt: 0, mAz: 0, mR: 0 };
  const corridorCtx = ctxs.find((c) => c.site.id === opts.corridorSiteId) ?? null;
  const corridorRange = opts.corridorRangeM ?? 40000;

  for (const ac of aircraft) {
    if (!(ac.gs > 15) || !isFinite(ac.lat) || !isFinite(ac.hEll)) continue;
    const tr = propagate(ac, now, n, step);
    // display track (every 30 s)
    const trk: [number, number][] = [];
    for (let k = 0; k < n; k += Math.max(1, Math.round(30 / step))) trk.push([tr.lon[k], tr.lat[k]]);
    trk.push([tr.lon[n - 1], tr.lat[n - 1]]);
    tracks[ac.hex] = trk;

    const span = typeInfo(ac.type, ac.category).span;
    let anyCandidate = false;

    for (const ctx of ctxs) {
      if (!moonUp[ctx.site.id]) continue;
      if (tr.h[0] - ctx.site.hEll < 150 && ac.vRate <= 0) continue;
      // coarse scan
      let kMin = -1;
      let sMin = 1e9;
      let rAtMin = 0;
      for (let k = 0; k < n; k++) {
        look(ctx, tr, now + k * step, lr);
        if (lr.mAlt < opts.minMoonAlt || lr.dh < 100) continue;
        if (lr.sep < sMin) {
          sMin = lr.sep;
          kMin = k;
          rAtMin = lr.r;
        }
      }
      if (kMin < 0) continue;
      const reachDeg = ctx.site.reachM > 0 ? Math.atan(ctx.site.reachM / Math.max(rAtMin, 1000)) * RAD * 1.25 : 0;
      const limit = Math.max(lr.mR + opts.nearDeg, reachDeg + lr.mR + 0.3);
      if (sMin > limit + 1.5) continue;
      // golden-section refinement
      let a = now + Math.max(0, kMin - 1) * step;
      let b = now + Math.min(n - 1, kMin + 1) * step;
      const gr = 0.6180339887;
      let c = b - gr * (b - a);
      let d = a + gr * (b - a);
      let fc = look(ctx, tr, c, lr).sep;
      let fd = look(ctx, tr, d, lr).sep;
      for (let it = 0; it < 32; it++) {
        if (fc < fd) {
          b = d; d = c; fd = fc; c = b - gr * (b - a); fc = look(ctx, tr, c, lr).sep;
        } else {
          a = c; c = d; fc = fd; d = a + gr * (b - a); fd = look(ctx, tr, d, lr).sep;
        }
      }
      const tMin = (a + b) / 2;
      const L0 = { ...look(ctx, tr, tMin, lr) };
      if (L0.mAlt < opts.minMoonAlt) continue;
      const rho = L0.mR;
      const [ox, oy] = offsetXY(L0);
      const La = { ...look(ctx, tr, tMin - 0.25, lr) };
      const Lb = { ...look(ctx, tr, tMin + 0.25, lr) };
      const [ax, ay] = offsetXY(La);
      const [bx, by] = offsetXY(Lb);
      const rate = Math.hypot(bx - ax, by - ay) / 0.5;
      const isTransit = L0.sep <= rho;
      const isNear = !isTransit && L0.sep <= rho + opts.nearDeg;

      // shadow corridor around the pass, and how far the observer would need to move
      const cor = corridor(ctx, tr, Math.max(now, tMin - 75), Math.min(now + opts.horizonSec, tMin + 75), 1);
      const mv = nearestOnCorridor(ctx.site, cor);
      const isReach = !isTransit && !!mv && ctx.site.reachM > 0 && mv.distM - mv.halfWidthM <= ctx.site.reachM;
      if (!isTransit && !isNear && !isReach) continue;

      const sigma = sigmaFor(ac, (mv?.tCenter ?? tMin) - ac.tPos, L0.mAlt);
      const prob = mv
        ? isReach && !isNear
          ? hitProbability(0, mv.halfWidthM, sigma)
          : hitProbability(mv.perpM, mv.halfWidthM, sigma)
        : isTransit
          ? 0.5
          : 0;
      const spanSec = Math.min(40, Math.max(1.2, (7 * rho) / Math.max(rate, 0.01)));
      const path: Pass['path'] = [];
      for (let i = 0; i <= 48; i++) {
        const dt = -spanSec / 2 + (spanSec * i) / 48;
        const [px, py] = offsetXY(look(ctx, tr, tMin + dt, lr));
        path.push({ dt, x: px, y: py });
      }
      anyCandidate = true;
      const kind: Pass['kind'] = isTransit ? 'transit' : isNear ? 'near' : 'reach';
      passes.push({
        key: `${ctx.site.id}:${ac.hex}`,
        siteId: ctx.site.id,
        hex: ac.hex,
        kind,
        t: tMin,
        sepDeg: L0.sep,
        moonRadiusDeg: rho,
        durationSec: isTransit ? (2 * Math.sqrt(Math.max(rho * rho - L0.sep * L0.sep, 0))) / Math.max(rate, 1e-4) : 0,
        rangeM: L0.r,
        acHeightM: L0.dh,
        elevDeg: L0.el,
        azDeg: L0.az,
        moonAlt: L0.mAlt,
        moonAz: L0.mAz,
        relRateDegS: rate,
        pathAngle: (Math.atan2(bx - ax, by - ay) * RAD + 360) % 360,
        offX: ox,
        offY: oy,
        path,
        angularSpanArcmin: (span / L0.r) * RAD * 60,
        sigmaM: sigma,
        probability: prob,
        move: mv,
      });
      corridors.push({ key: `${ctx.site.id}:${ac.hex}`, hex: ac.hex, siteId: ctx.site.id, pts: cor, highlight: true });
    }

    // ambient corridors for the active site (map)
    if (corridorCtx && !anyCandidate && moonUp[corridorCtx.site.id]) {
      const pts = corridor(corridorCtx, tr, now, now + opts.horizonSec, 6);
      if (pts.length > 1) {
        const kLat = 110540, kLon = 111320 * Math.cos(corridorCtx.site.lat * DEG);
        let near = false;
        for (const p of pts) {
          if (Math.hypot((p.lat - corridorCtx.site.lat) * kLat, (p.lon - corridorCtx.site.lon) * kLon) < corridorRange) {
            near = true;
            break;
          }
        }
        if (near) corridors.push({ key: `amb:${ac.hex}`, hex: ac.hex, siteId: corridorCtx.site.id, pts, highlight: false });
      }
    }
  }
  passes.sort((p, q) => p.t - q.t);
  return { passes, corridors, tracks, moonUp, computedAt: now, ms: performance.now() - started };
}
