// Fallback observer position from the device time zone (used only until the user adds a site).
import type { Place } from './astro';

const TZ: Record<string, [number, number]> = {
  'Europe/Warsaw': [52.23, 21.01], 'Europe/London': [51.51, -0.13], 'Europe/Berlin': [52.52, 13.4], 'Europe/Paris': [48.86, 2.35],
  'Europe/Madrid': [40.42, -3.7], 'Europe/Rome': [41.9, 12.5], 'Europe/Amsterdam': [52.37, 4.9], 'Europe/Brussels': [50.85, 4.35],
  'Europe/Vienna': [48.21, 16.37], 'Europe/Prague': [50.08, 14.44], 'Europe/Stockholm': [59.33, 18.07], 'Europe/Oslo': [59.91, 10.75],
  'Europe/Copenhagen': [55.68, 12.57], 'Europe/Helsinki': [60.17, 24.94], 'Europe/Dublin': [53.35, -6.26], 'Europe/Lisbon': [38.72, -9.14],
  'Europe/Athens': [37.98, 23.73], 'Europe/Kyiv': [50.45, 30.52], 'Europe/Kiev': [50.45, 30.52], 'Europe/Budapest': [47.5, 19.04],
  'Europe/Bucharest': [44.43, 26.1], 'Europe/Zurich': [47.37, 8.54], 'Europe/Vilnius': [54.69, 25.28], 'Europe/Riga': [56.95, 24.11],
  'Europe/Tallinn': [59.44, 24.75], 'Europe/Bratislava': [48.15, 17.11], 'Europe/Istanbul': [41.01, 28.98],
  'America/New_York': [40.71, -74.01], 'America/Chicago': [41.88, -87.63], 'America/Denver': [39.74, -104.99],
  'America/Los_Angeles': [34.05, -118.24], 'America/Phoenix': [33.45, -112.07], 'America/Toronto': [43.65, -79.38],
  'America/Vancouver': [49.28, -123.12], 'America/Mexico_City': [19.43, -99.13], 'America/Sao_Paulo': [-23.55, -46.63],
  'America/Buenos_Aires': [-34.6, -58.38], 'America/Argentina/Buenos_Aires': [-34.6, -58.38], 'Asia/Tokyo': [35.68, 139.69],
  'Asia/Shanghai': [31.23, 121.47], 'Asia/Hong_Kong': [22.32, 114.17], 'Asia/Singapore': [1.35, 103.82], 'Asia/Kolkata': [28.61, 77.21],
  'Asia/Calcutta': [28.61, 77.21], 'Asia/Dubai': [25.2, 55.27], 'Asia/Seoul': [37.57, 126.98], 'Asia/Bangkok': [13.76, 100.5],
  'Australia/Sydney': [-33.87, 151.21], 'Australia/Melbourne': [-37.81, 144.96], 'Australia/Perth': [-31.95, 115.86],
  'Pacific/Auckland': [-36.85, 174.76], 'Africa/Johannesburg': [-26.2, 28.05], 'Africa/Cairo': [30.04, 31.24],
};

export function timezonePlace(): Place {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* ignore */
  }
  const hit = TZ[tz];
  if (hit) return { lat: hit[0], lon: hit[1], elev: 100 };
  return { lat: 45, lon: Math.max(-180, Math.min(180, (-new Date().getTimezoneOffset() / 60) * 15)), elev: 100 };
}
