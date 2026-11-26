import { DEG } from './geo';

/**
 * Astronomical refraction for a TRUE (geometric) altitude, Sæmundsson (1986),
 * scaled for station pressure (via elevation) and temperature. Returns degrees.
 */
export function refractionDeg(altTrueDeg: number, elevM = 0, tempC = 10): number {
  const h = Math.max(altTrueDeg, -1.0);
  const arcmin = 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * DEG);
  const pressureRatio = Math.exp(-Math.max(elevM, 0) / 8434);
  return (Math.max(arcmin, 0) / 60) * pressureRatio * (283 / (273 + tempC));
}

/**
 * Fraction of full astronomical refraction that applies to a target inside the atmosphere,
 * dh metres above the observer (exponential atmosphere, scale height H, path weighting (D-s)/D).
 * e.g. airliner at 11 km ≈ 0.46.
 */
export function refractionFraction(dhM: number, H = 8000): number {
  const x = Math.max(dhM, 1) / H;
  return 1 - (1 - Math.exp(-x)) / x;
}

/** Kasten & Young airmass for apparent altitude (deg). */
export function airmass(altDeg: number): number {
  const h = Math.max(altDeg, -1);
  return 1 / (Math.sin(h * DEG) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
}
