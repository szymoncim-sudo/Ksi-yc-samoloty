import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Aircraft, PredictResult } from '../lib/transit';
import type { FeedSource } from '../lib/flights';
import { BUILD_LANG } from '../lib/platform';

export interface SiteDef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** ground elevation, m MSL (null = not fetched yet) */
  ground: number | null;
  groundManual: boolean;
  /** eye height above ground (m) */
  agl: number;
  reachKm: number;
  enabled: boolean;
}

export interface Settings {
  lang: 'en' | 'pl';
  horizonMin: number;
  refreshSec: number;
  minMoonAlt: number;
  nearDeg: number;
  source: FeedSource;
  apiBase: string;
  sound: boolean;
  beeps: boolean;
  alertLeadSec: number;
  keepAwake: boolean;
  units: 'metric' | 'aviation';
  moonOrientation: 'horizon' | 'north';
  atmosphere: boolean;
  earthshine: boolean;
  labels: boolean;
  quality: 'high' | 'balanced';
  nightRed: boolean;
  useGps: boolean;
  showAmbient: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: BUILD_LANG,
  horizonMin: 10,
  refreshSec: 10,
  minMoonAlt: 4,
  nearDeg: 1.5,
  source: 'auto',
  apiBase: '',
  sound: true,
  beeps: true,
  alertLeadSec: 60,
  keepAwake: true,
  units: 'metric',
  moonOrientation: 'horizon',
  atmosphere: true,
  earthshine: true,
  labels: false,
  quality: 'high',
  nightRed: false,
  useGps: false,
  showAmbient: true,
};

export type Tab = 'moon' | 'radar' | 'places' | 'settings';

export interface FeedState {
  status: 'idle' | 'loading' | 'ok' | 'error' | 'paused';
  source?: string;
  fetchedAt?: number;
  serverNow?: number;
  count: number;
  error?: string;
  reason?: string;
  clockSkew?: number;
}

export interface GpsFix {
  lat: number;
  lon: number;
  acc: number;
  ground: number | null;
  ts: number;
}

interface State {
  settings: Settings;
  sites: SiteDef[];
  activeSiteId: string | null;
  onboarded: boolean;
  tab: Tab;
  timeOffsetMs: number;
  gps: GpsFix | null;
  feed: FeedState;
  aircraft: Aircraft[];
  prediction: PredictResult | null;
  selectedPassKey: string | null;
  focusSiteId: string | null;
  setSettings(p: Partial<Settings>): void;
  addSite(s: Omit<SiteDef, 'id'>): string;
  updateSite(id: string, p: Partial<SiteDef>): void;
  removeSite(id: string): void;
  setActiveSite(id: string): void;
  setTab(t: Tab): void;
  setTimeOffset(ms: number): void;
  setGps(g: GpsFix | null): void;
  setFeed(f: Partial<FeedState>): void;
  setAircraft(a: Aircraft[]): void;
  setPrediction(p: PredictResult | null): void;
  selectPass(key: string | null): void;
  setOnboarded(v: boolean): void;
  focusSite(id: string | null): void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      sites: [],
      activeSiteId: null,
      onboarded: false,
      tab: 'moon',
      timeOffsetMs: 0,
      gps: null,
      feed: { status: 'idle', count: 0 },
      aircraft: [],
      prediction: null,
      selectedPassKey: null,
      focusSiteId: null,
      setSettings: (p) => set({ settings: { ...get().settings, ...p } }),
      addSite: (s) => {
        const id = uid();
        set({ sites: [...get().sites, { ...s, id }], activeSiteId: get().activeSiteId ?? id });
        return id;
      },
      updateSite: (id, p) => set({ sites: get().sites.map((s) => (s.id === id ? { ...s, ...p } : s)) }),
      removeSite: (id) => {
        const sites = get().sites.filter((s) => s.id !== id);
        const active = get().activeSiteId === id ? (sites[0]?.id ?? null) : get().activeSiteId;
        set({ sites, activeSiteId: active });
      },
      setActiveSite: (id) => set({ activeSiteId: id }),
      setTab: (tab) => set({ tab }),
      setTimeOffset: (timeOffsetMs) => set({ timeOffsetMs }),
      setGps: (gps) => set({ gps }),
      setFeed: (f) => set({ feed: { ...get().feed, ...f } }),
      setAircraft: (aircraft) => set({ aircraft }),
      setPrediction: (prediction) => set({ prediction }),
      selectPass: (selectedPassKey) => set({ selectedPassKey }),
      setOnboarded: (onboarded) => set({ onboarded }),
      focusSite: (focusSiteId) => set({ focusSiteId }),
    }),
    {
      name: 'lunaris-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ settings: s.settings, sites: s.sites, activeSiteId: s.activeSiteId, onboarded: s.onboarded, buildLang: BUILD_LANG }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State> & { buildLang?: string };
        const settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
        // a different build flavour (EN/PL .exe) starts in its own language once
        if (p.buildLang !== BUILD_LANG) settings.lang = BUILD_LANG;
        return { ...current, ...p, settings };
      },
    },
  ),
);

export const GPS_SITE_ID = 'gps';
