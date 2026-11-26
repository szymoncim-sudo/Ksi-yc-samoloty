import { describe, expect, it } from 'vitest';
import * as A from 'astronomy-engine';
import { makeMoonSampler, moonGeometry, moonInfo, subObserverPoint } from './astro';
import {
  altAzToEnu,
  bearingDeg,
  destination,
  ecefToGeodetic,
  enuDirToEcef,
  enuFrame,
  geodeticToEcef,
  geoidUndulation,
} from './geo';
import { refractionDeg, refractionFraction } from './refraction';
import { Aircraft, Site, predict } from './transit';

const site: Site = {
  id: 's1',
  name: 'Test',
  lat: 52.2297,
  lon: 21.0122,
  elevMsl: 110,
  hEll: 110 + geoidUndulation(52.2297, 21.0122),
  reachM: 0,
};

function findMoonHigh(start: Date): number {
  for (let h = 0; h < 24 * 30; h++) {
    const d = new Date(start.getTime() + h * 3600000);
    const m = moonInfo(d, { lat: site.lat, lon: site.lon, elev: site.elevMsl });
    if (m.alt > 35) return d.getTime() / 1000;
  }
  throw new Error('no moon');
}

/** Builds an aircraft that will be exactly in front of the Moon centre at t0 + lead. */
function syntheticAircraft(t0: number, lead: number, dh: number, track: number, gs: number): Aircraft {
  const tHit = t0 + lead;
  const sampler = makeMoonSampler({ lat: site.lat, lon: site.lon, elev: site.elevMsl }, tHit - 5, 20, 5);
  const m = sampler.at(tHit);
  const altEff = m.altGeo + (1 - refractionFraction(dh)) * refractionDeg(m.altGeo, site.elevMsl);
  const f = enuFrame(site.lat, site.lon, site.hEll);
  const dir = enuDirToEcef(f, altAzToEnu(altEff, m.az));
  let s = dh / Math.sin((altEff * Math.PI) / 180);
  let g = { lat: 0, lon: 0, h: 0 };
  for (let i = 0; i < 8; i++) {
    g = ecefToGeodetic(f.origin[0] + s * dir[0], f.origin[1] + s * dir[1], f.origin[2] + s * dir[2]);
    s -= (g.h - (site.hEll + dh)) / Math.sin((altEff * Math.PI) / 180);
  }
  g = ecefToGeodetic(f.origin[0] + s * dir[0], f.origin[1] + s * dir[1], f.origin[2] + s * dir[2]);
  const [lat0, lon0] = destination(g.lat, g.lon, (track + 180) % 360, gs * lead);
  return {
    hex: 'abc123',
    callsign: 'TEST1',
    reg: 'SP-TST',
    type: 'B738',
    desc: '',
    category: 'A3',
    lat: lat0,
    lon: lon0,
    hEll: g.h,
    altFt: 36000,
    altSource: 'geom',
    gs,
    track: bearingDeg(lat0, lon0, g.lat, g.lon),
    trackRate: 0,
    vRate: 0,
    tPos: t0,
    squawk: '1000',
    mil: false,
  };
}

describe('geodesy', () => {
  it('round-trips ECEF', () => {
    const p = geodeticToEcef(52.1, 21.3, 11234.5);
    const g = ecefToGeodetic(...p);
    expect(g.lat).toBeCloseTo(52.1, 9);
    expect(g.lon).toBeCloseTo(21.3, 9);
    expect(g.h).toBeCloseTo(11234.5, 4);
  });
  it('geoid undulation is plausible', () => {
    const n = geoidUndulation(52.23, 21.01);
    expect(n).toBeGreaterThan(25);
    expect(n).toBeLessThan(40);
  });
});

describe('moon geometry', () => {
  it('sub-observer point matches libration within ~1.5°', () => {
    const d = new Date('2026-11-24T20:00:00Z');
    const g = moonGeometry(d, null);
    const so = subObserverPoint(g);
    const lib = A.Libration(d);
    expect(Math.abs(so.lat - lib.elat)).toBeLessThan(1.5);
    expect(Math.abs(so.lon - lib.elon)).toBeLessThan(1.5);
  });
});

describe('transit engine', () => {
  const t0 = findMoonHigh(new Date('2026-11-20T00:00:00Z'));

  it('finds an exactly central transit at the right time', () => {
    const ac = syntheticAircraft(t0, 180, 10800, 75, 235);
    const res = predict([ac], [site], { now: t0, horizonSec: 600, minMoonAlt: 2, nearDeg: 1 });
    expect(res.passes.length).toBe(1);
    const p = res.passes[0];
    expect(p.kind).toBe('transit');
    expect(Math.abs(p.t - (t0 + 180))).toBeLessThan(0.3);
    expect(p.sepDeg).toBeLessThan(0.02);
    expect(p.durationSec).toBeGreaterThan(0.2);
    expect(p.durationSec).toBeLessThan(5);
    expect(p.move).not.toBeNull();
    expect(p.move!.distM).toBeLessThan(40);
    expect(p.move!.halfWidthM).toBeGreaterThan(40);
    expect(p.move!.halfWidthM).toBeLessThan(400);
    expect(p.probability).toBeGreaterThan(0.3);
  });

  it('reports a near pass when offset sideways, and reach when the observer can move', () => {
    const ac = syntheticAircraft(t0, 240, 10800, 75, 235);
    // shift the aircraft 1.5 km sideways (perpendicular to track)
    const [la, lo] = destination(ac.lat, ac.lon, (ac.track + 90) % 360, 1500);
    const shifted = { ...ac, lat: la, lon: lo };
    const r1 = predict([shifted], [site], { now: t0, horizonSec: 600, minMoonAlt: 2, nearDeg: 8 });
    expect(r1.passes[0]?.kind).toBe('near');
    const r2 = predict([shifted], [{ ...site, reachM: 5000 }], { now: t0, horizonSec: 600, minMoonAlt: 2, nearDeg: 0.2 });
    expect(r2.passes[0]?.kind).toBe('reach');
    const mv = r2.passes[0].move!;
    expect(mv.distM).toBeGreaterThan(800);
    expect(mv.distM).toBeLessThan(3500);
  });

  it('is fast enough for 400 aircraft and 3 sites', () => {
    const fleet: Aircraft[] = [];
    for (let i = 0; i < 400; i++) {
      const ac = syntheticAircraft(t0, 60 + i, 9000 + (i % 7) * 400, (i * 37) % 360, 200 + (i % 50));
      const [la, lo] = destination(ac.lat, ac.lon, (i * 53) % 360, (i % 40) * 3000);
      fleet.push({ ...ac, hex: `h${i}`, lat: la, lon: lo });
    }
    const sites = [site, { ...site, id: 's2', lat: 52.4 }, { ...site, id: 's3', lon: 21.3, reachM: 3000 }];
    const res = predict(fleet, sites, { now: t0, horizonSec: 600, minMoonAlt: 2, nearDeg: 1.5, corridorSiteId: 's1' });
    expect(res.ms).toBeLessThan(4000);
    console.log(`predict: ${res.ms.toFixed(0)} ms, ${res.passes.length} passes, ${res.corridors.length} corridors`);
  });
});
