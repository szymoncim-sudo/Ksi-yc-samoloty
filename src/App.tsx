import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { IMoon, IPin, ISliders, ITransit, Logo } from './components/icons';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MoonCanvas } from './components/moon';
import { useActivePlace } from './components/SitePicker';
import { useNow } from './components/ui';
import { HAS_GPS, IS_ELECTRON } from './lib/platform';
import { useT } from './i18n';
import { MoonScreen } from './screens/MoonScreen';
import { startAlerts, unlockAudio, useToasts } from './state/alerts';
import { refreshNow, startFeed } from './state/feed';
import { GPS_SITE_ID, useStore, type Tab } from './state/store';

const TransitsScreen = lazy(() => import('./screens/TransitsScreen'));
const SitesScreen = lazy(() => import('./screens/SitesScreen'));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'));

function Tabs() {
  const t = useT();
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const prediction = useStore((s) => s.prediction);
  const now = useNow(1000) / 1000;
  const n = (prediction?.passes ?? []).filter((p) => p.t > now && p.kind === 'transit').length;
  const items: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'moon', label: t.tabs.moon, icon: <IMoon /> },
    { id: 'radar', label: t.tabs.transits, icon: <ITransit /> },
    { id: 'places', label: t.tabs.sites, icon: <IPin /> },
    { id: 'settings', label: t.tabs.settings, icon: <ISliders /> },
  ];
  return (
    <nav className="tabs">
      <div className="tabs__brand">
        <Logo width={26} height={26} />
      </div>
      {items.map((it) => (
        <button key={it.id} className={`tab ${tab === it.id ? 'is-on' : ''}`} onClick={() => setTab(it.id)} aria-current={tab === it.id}>
          {it.icon}
          <span>{it.label}</span>
          {it.id === 'radar' && n > 0 && <span className="tab__n">{n}</span>}
        </button>
      ))}
    </nav>
  );
}

function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toasts">
      {toasts.map((x) => (
        <button
          key={x.id}
          className="toast"
          onClick={() => {
            if (x.passKey) {
              useStore.getState().selectPass(x.passKey);
              useStore.getState().setTab('radar');
            }
            dismiss(x.id);
          }}
        >
          <span>
            <span className="toast__t" style={{ display: 'block' }}>
              {x.title}
            </span>
            <span className="toast__b" style={{ display: 'block' }}>
              {x.body}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Onboarding() {
  const t = useT();
  const set = useStore((s) => s.setSettings);
  const setActive = useStore((s) => s.setActiveSite);
  const setOnboarded = useStore((s) => s.setOnboarded);
  const setTab = useStore((s) => s.setTab);
  const { place, approximate } = useActivePlace();
  const lang = useStore((s) => s.settings.lang);
  const date = useMemo(() => new Date(Math.floor(Date.now() / 60000) * 60000), []);
  return (
    <div className="ob">
      <div className="ob__moon">
        <MoonCanvas
          params={{ date, place: approximate ? null : place, orientation: 'north', atmosphere: false, earthshine: true, labels: false, labelLang: lang }}
          fill={0.72}
          offsetY={0}
        />
      </div>
      <div className="ob__body">
        <div className="brand ob__brand">
          <Logo /> LUNARIS
        </div>
        <h1>{t.onboarding.title}</h1>
        <p>{t.onboarding.text}</p>
        <div className="ob__btns">
          {HAS_GPS && (
            <button
              className="btn btn--solid"
              onClick={() => {
                unlockAudio();
                set({ useGps: true });
                setActive(GPS_SITE_ID);
                setOnboarded(true);
              }}
            >
              {t.onboarding.useLocation}
            </button>
          )}
          <button
            className={HAS_GPS ? 'btn' : 'btn btn--solid'}
            onClick={() => {
              unlockAudio();
              setOnboarded(true);
              setTab('places');
            }}
          >
            {t.onboarding.pick}
          </button>
          <div className="inline" style={{ justifyContent: 'center', marginTop: 6 }}>
            <button className="btn btn--sm" style={{ border: 0, color: 'var(--fg-3)' }} onClick={() => set({ lang: lang === 'en' ? 'pl' : 'en' })}>
              {lang === 'en' ? 'Polski' : 'English'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const tab = useStore((s) => s.tab);
  const nightRed = useStore((s) => s.settings.nightRed);
  const keepAwake = useStore((s) => s.settings.keepAwake);
  const lang = useStore((s) => s.settings.lang);
  const onboarded = useStore((s) => s.onboarded);
  const [mounted, setMounted] = useState<Record<Tab, boolean>>({ moon: true, radar: false, places: false, settings: false });

  useEffect(() => {
    startFeed();
    startAlerts();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!mounted[tab]) setMounted((m) => ({ ...m, [tab]: true }));
    if (tab === 'radar') refreshNow();
  }, [tab, mounted]);

  useEffect(() => {
    if (!keepAwake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not permitted */
      }
    };
    acquire();
    const onVis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => undefined);
    };
  }, [keepAwake]);

  return (
    <div className={`app ${IS_ELECTRON ? 'electron' : ''}`}>
      <div className="titlebar-drag" />
      <div className={`app__frame ${nightRed ? 'night-red' : ''}`}>
        <main className="app__main">
          <div className={`screen ${tab === 'moon' ? 'is-on' : ''}`}>
            <ErrorBoundary name="moon">
              <MoonScreen />
            </ErrorBoundary>
          </div>
          <Suspense fallback={null}>
            {mounted.radar && (
              <div className={`screen ${tab === 'radar' ? 'is-on' : ''}`}>
                <ErrorBoundary name="transits">
                  <TransitsScreen active={tab === 'radar'} />
                </ErrorBoundary>
              </div>
            )}
            {mounted.places && (
              <div className={`screen ${tab === 'places' ? 'is-on' : ''}`}>
                <ErrorBoundary name="sites">
                  <SitesScreen active={tab === 'places'} />
                </ErrorBoundary>
              </div>
            )}
            {mounted.settings && (
              <div className={`screen ${tab === 'settings' ? 'is-on' : ''}`}>
                <ErrorBoundary name="settings">
                  <SettingsScreen />
                </ErrorBoundary>
              </div>
            )}
          </Suspense>
          <Toasts />
          {!onboarded && <Onboarding />}
        </main>
        {onboarded && <Tabs />}
      </div>
    </div>
  );
}
