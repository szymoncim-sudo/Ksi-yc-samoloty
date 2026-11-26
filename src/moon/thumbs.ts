// Queue of Moon thumbnail snapshots rendered by the shared engine, a few per frame.
import { useEffect, useState } from 'react';
import type { Place } from '../lib/astro';
import { getMoonEngine } from './MoonEngine';

interface Job {
  key: string;
  date: Date;
  place: Place | null;
  size: number;
  orientation: 'horizon' | 'north';
}

const cache = new Map<string, string>();
const waiting = new Map<string, Set<(url: string) => void>>();
const queue: Job[] = [];
let scheduled = false;

function pump() {
  scheduled = false;
  const eng = getMoonEngine();
  if (!eng.ready) {
    const off = eng.on((e) => {
      if (e.ready) {
        off();
        schedule();
      }
    });
    return;
  }
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 12) {
    const j = queue.shift()!;
    if (cache.has(j.key)) continue;
    const c = eng.snapshot({ date: j.date, place: j.place, orientation: j.orientation, atmosphere: false, earthshine: true, labels: false }, j.size);
    if (!c) continue;
    const url = c.toDataURL('image/png');
    cache.set(j.key, url);
    waiting.get(j.key)?.forEach((cb) => cb(url));
    waiting.delete(j.key);
  }
  if (queue.length) schedule();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(pump);
}

export function thumbKey(date: Date, size: number, orientation: string, place: Place | null) {
  const h = Math.round(date.getTime() / 1800000);
  const p = place ? `${place.lat.toFixed(1)},${place.lon.toFixed(1)}` : 'geo';
  return `${h}|${size}|${orientation}|${orientation === 'horizon' ? p : ''}`;
}

export function useMoonThumb(date: Date, size: number, opts: { orientation?: 'horizon' | 'north'; place?: Place | null } = {}) {
  const orientation = opts.orientation ?? 'north';
  const place = opts.place ?? null;
  const key = thumbKey(date, size, orientation, place);
  const [url, setUrl] = useState<string | null>(() => cache.get(key) ?? null);
  useEffect(() => {
    const c = cache.get(key);
    if (c) {
      setUrl(c);
      return;
    }
    setUrl(null);
    let alive = true;
    const cb = (u: string) => alive && setUrl(u);
    if (!waiting.has(key)) {
      waiting.set(key, new Set());
      queue.push({ key, date, place, size: Math.round(size * Math.min(2, window.devicePixelRatio || 1)), orientation });
      schedule();
    }
    waiting.get(key)!.add(cb);
    return () => {
      alive = false;
      waiting.get(key)?.delete(cb);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}
