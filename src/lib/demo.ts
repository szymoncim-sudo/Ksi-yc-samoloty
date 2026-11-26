// Synthetic aircraft that crosses the Moon's centre exactly over a site – used for the in-app
// "show me a transit" demo and for unit tests.
import { makeMoonSampler } from './astro';
import { altAzToEnu, bearingDeg, destination, ecefToGeodetic, enuDirToEcef, enuFrame } from './geo';
import { refractionDeg, refractionFraction } from './refraction';
import type { Aircraft, Site } from './transit';

export function syntheticTransit(site: Site, t0: number, lead: number, dh = 10800, trackHint = 75, gs = 235): Aircraft | null {
  const tHit = t0 + lead;
  const sampler = makeMoonSampler({ lat: site.lat, lon: site.lon, elev: site.elevMsl }, tHit - 5, 20, 5);
  const m = sampler.at(tHit);
  if (m.alt < 3) return null;
  const altEff = m.altGeo + (1 - refractionFraction(dh)) * refractionDeg(m.altGeo, site.elevMsl);
  const f = enuFrame(site.lat, site.lon, site.hEll);
  const dir = enuDirToEcef(f, altAzToEnu(altEff, m.az));
  const sinA = Math.sin((altEff * Math.PI) / 180);
  let s = dh / sinA;
  let g = { lat: 0, lon: 0, h: 0 };
  for (let i = 0; i < 8; i++) {
    g = ecefToGeodetic(f.origin[0] + s * dir[0], f.origin[1] + s * dir[1], f.origin[2] + s * dir[2]);
    s -= (g.h - (site.hEll + dh)) / sinA;
  }
  g = ecefToGeodetic(f.origin[0] + s * dir[0], f.origin[1] + s * dir[1], f.origin[2] + s * dir[2]);
  // fly roughly across the line of sight for a crisp crossing
  const track = (m.az + 90 + trackHint) % 360;
  const [lat0, lon0] = destination(g.lat, g.lon, (track + 180) % 360, gs * lead);
  return {
    hex: 'demo01',
    callsign: 'LUNA42',
    reg: 'SP-LUN',
    type: 'A20N',
    desc: 'AIRBUS A-320neo',
    category: 'A3',
    lat: lat0,
    lon: lon0,
    hEll: g.h,
    altFt: Math.round(g.h / 0.3048 / 100) * 100,
    altSource: 'geom',
    gs,
    track: bearingDeg(lat0, lon0, g.lat, g.lon),
    trackRate: 0,
    vRate: 0,
    tPos: t0,
    squawk: '7000',
    mil: false,
  };
}
