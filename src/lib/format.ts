// Locale-aware formatting (English en-GB or Polish pl-PL, following the UI language).
import { useStore } from '../state/store';

const LOCALES = { en: 'en-GB', pl: 'pl-PL' } as const;
const loc = () => LOCALES[useStore.getState().settings.lang] ?? 'en-GB';

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(d: number) {
  const key = `${loc()}|${d}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(loc(), { minimumFractionDigits: d, maximumFractionDigits: d });
    nfCache.set(key, f);
  }
  return f;
}

export const n0 = (v: number) => nf(0).format(v);
export const n1 = (v: number) => nf(1).format(v);
export const n2 = (v: number) => nf(2).format(v);

export const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0');

export const fmtTime = (d: Date | number, seconds = false) =>
  new Date(d).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined, hour12: false });

export const fmtDate = (d: Date | number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Date(d).toLocaleDateString(loc(), opts);

export const fmtDateTime = (d: Date | number) =>
  `${new Date(d).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' })} ${fmtTime(d)}`;

export const fmtMonth = (d: Date | number) => new Date(d).toLocaleDateString(loc(), { month: 'long', year: 'numeric' });

export function relDays(d: Date, from: Date): string {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((b - a) / 86400000);
  const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: 'auto' });
  if (Math.abs(days) < 60) return rtf.format(days, 'day');
  return rtf.format(Math.round(days / 30.44), 'month');
}

/** mm:ss (or h:mm:ss) */
export function clock(sec: number): string {
  const a = Math.max(0, Math.floor(sec));
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const s = a % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** mm:ss.t with locale decimal separator */
export function clockTenths(sec: number): string {
  const a = Math.max(0, sec);
  const m = Math.floor(a / 60);
  const s = a - m * 60;
  const dec = loc() === 'pl-PL' ? ',' : '.';
  return `${pad2(m)}:${s.toFixed(1).padStart(4, '0').replace('.', dec)}`;
}

const DIRS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass16 = (az: number) => DIRS16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
export const compass8i = (az: number) => Math.round((((az % 360) + 360) % 360) / 45) % 8;

export function distance(m: number): string {
  if (m < 1000) return `${n0(Math.round(m / 5) * 5)} m`;
  if (m < 10000) return `${n1(m / 1000)} km`;
  return `${n0(m / 1000)} km`;
}

export function arc(deg: number): string {
  const a = Math.abs(deg);
  const sign = deg < 0 ? '−' : '';
  if (a >= 1) return `${sign}${n1(a)}°`;
  const m = a * 60;
  if (m >= 1) {
    const mi = Math.floor(m);
    const s = Math.round((m - mi) * 60);
    return s === 60 ? `${sign}${mi + 1}′00″` : `${sign}${mi}′${pad2(s)}″`;
  }
  return `${sign}${n0(m * 60)}″`;
}

export function altitude(ft: number, units: 'metric' | 'aviation'): string {
  if (units === 'aviation') return ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${n0(Math.round(ft / 10) * 10)} ft`;
  return `${n0(Math.round((ft * 0.3048) / 10) * 10)} m`;
}

export function speed(ms: number, units: 'metric' | 'aviation'): string {
  return units === 'aviation' ? `${n0(ms / 0.514444)} kt` : `${n0(ms * 3.6)} km/h`;
}

export const pct = (v: number) => `${n0(Math.round(v * 100))}%`;
