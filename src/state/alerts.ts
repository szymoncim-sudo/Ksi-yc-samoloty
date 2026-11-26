// In-app alerts: toasts, chime and countdown beeps for upcoming transits.
import { create } from 'zustand';
import { getDict } from '../i18n';
import { compass8i, distance } from '../lib/format';
import { useStore } from './store';

export interface Toast {
  id: string;
  title: string;
  body: string;
  passKey?: string;
}

export const useToasts = create<{ toasts: Toast[]; push(t: Toast): void; dismiss(id: string): void }>((set, get) => ({
  toasts: [],
  push: (t) => {
    set({ toasts: [...get().toasts.filter((x) => x.id !== t.id), t].slice(-3) });
    setTimeout(() => get().dismiss(t.id), 9000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    /* no audio */
  }
}

function tone(freq: number, dur: number, when = 0, gain = 0.16) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function chime() {
  tone(784, 0.35, 0, 0.12);
  tone(1175, 0.5, 0.12, 0.1);
  tone(1568, 0.7, 0.24, 0.08);
}

export function beep(final: boolean) {
  if (final) tone(1760, 0.5, 0, 0.18);
  else tone(1046, 0.09, 0, 0.14);
}

let started = false;

export function startAlerts() {
  if (started) return;
  started = true;
  const alerted = new Set<string>();
  const beeped = new Set<string>();
  window.addEventListener('pointerdown', () => unlockAudio(), { passive: true });
  setInterval(() => {
    const st = useStore.getState();
    const t = getDict();
    const now = Date.now() / 1000;
    for (const p of st.prediction?.passes ?? []) {
      const dt = p.t - now;
      if (dt < -2) continue;
      const lead = p.kind === 'reach' ? Math.max(st.settings.alertLeadSec, 240) : st.settings.alertLeadSec;
      const id = `${p.key}:${Math.round(p.t / 20)}`;
      const worth = p.kind === 'transit' || (p.kind === 'reach' && p.probability > 0.15) || (p.kind === 'near' && p.sepDeg < p.moonRadiusDeg * 1.6);
      if (dt > 0 && dt <= lead && worth && !alerted.has(id)) {
        alerted.add(id);
        const ac = st.aircraft.find((a) => a.hex === p.hex);
        const name = ac?.callsign || ac?.reg || p.hex.toUpperCase();
        const site = p.siteId === 'gps' ? t.myLocation : (st.sites.find((s) => s.id === p.siteId)?.name ?? '');
        const body = p.kind === 'reach' && p.move ? t.toast.walk(distance(p.move.distM), t.compass[compass8i(p.move.bearing)], site) : t.toast.inS(Math.round(dt), site);
        useToasts.getState().push({ id, title: t.toast.title(t.transit.kind[p.kind], name), body, passKey: p.key });
        if (st.settings.sound) chime();
      }
      if (p.kind === 'transit' && st.settings.sound && st.settings.beeps) {
        for (const s of [5, 4, 3, 2, 1, 0]) {
          const k = `${p.key}:${Math.round(p.t)}:${s}`;
          if (dt <= s && dt > s - 0.5 && !beeped.has(k)) {
            beeped.add(k);
            beep(s === 0);
          }
        }
      }
    }
  }, 100);
}
