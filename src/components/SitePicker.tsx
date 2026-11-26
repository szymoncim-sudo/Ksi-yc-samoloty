import { useMemo } from 'react';
import type { Place } from '../lib/astro';
import { n0 } from '../lib/format';
import { timezonePlace } from '../lib/places';
import { HAS_GPS } from '../lib/platform';
import { useT } from '../i18n';
import { GPS_SITE_ID, useStore } from '../state/store';
import { ILocate, IPlus } from './icons';
import { Sheet, Toggle } from './ui';

const TZ_PLACE = timezonePlace();

/** The place the Moon screen describes: primary site, GPS, or a time-zone estimate. */
export function useActivePlace(): { place: Place; label: string; siteId: string | null; approximate: boolean } {
  const t = useT();
  const sites = useStore((s) => s.sites);
  const activeId = useStore((s) => s.activeSiteId);
  const gps = useStore((s) => s.gps);
  const useGps = useStore((s) => s.settings.useGps);
  return useMemo(() => {
    if (activeId === GPS_SITE_ID && useGps && gps) {
      return { place: { lat: gps.lat, lon: gps.lon, elev: (gps.ground ?? 0) + 1.7 }, label: t.myLocation, siteId: GPS_SITE_ID, approximate: false };
    }
    const s = sites.find((x) => x.id === activeId) ?? sites[0];
    if (!s) return { place: TZ_PLACE, label: t.approxPlace, siteId: null, approximate: true };
    return { place: { lat: s.lat, lon: s.lon, elev: (s.ground ?? 0) + s.agl }, label: s.name, siteId: s.id, approximate: false };
  }, [sites, activeId, gps, useGps, t]);
}

export function SitePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const sites = useStore((s) => s.sites);
  const activeId = useStore((s) => s.activeSiteId);
  const setActive = useStore((s) => s.setActiveSite);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const gps = useStore((s) => s.gps);
  const setTab = useStore((s) => s.setTab);
  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="h1">{t.sites.picker}</h2>
      <p className="lead">{t.sites.pickerSub}</p>
      <div style={{ marginTop: 14, borderTop: '1px solid var(--line)' }}>
        {sites.map((s, i) => (
          <button
            key={s.id}
            className={`site ${s.id === activeId ? 'is-primary' : ''} ${s.enabled ? '' : 'is-off'}`}
            onClick={() => {
              setActive(s.id);
              onClose();
            }}
          >
            <span className="site__i">{i + 1}</span>
            <span style={{ minWidth: 0 }}>
              <span className="site__n" style={{ display: 'block' }}>
                {s.name}
              </span>
              <span className="site__m" style={{ display: 'block' }}>
                {s.ground !== null ? `${n0(s.ground + s.agl)} ${t.sites.asl}` : t.sites.elevPending} · {s.lat.toFixed(4)}, {s.lon.toFixed(4)}
              </span>
            </span>
            <span />
          </button>
        ))}
        {HAS_GPS && (
          <div className={`site ${activeId === GPS_SITE_ID ? 'is-primary' : ''}`}>
            <span className="site__i">
              <ILocate width={16} height={16} style={{ verticalAlign: -3 }} />
            </span>
            <button
              style={{ minWidth: 0 }}
              onClick={() => {
                if (!settings.useGps) setSettings({ useGps: true });
                setActive(GPS_SITE_ID);
                onClose();
              }}
            >
              <span className="site__n" style={{ display: 'block' }}>
                {t.sites.gps}
              </span>
              <span className="site__m" style={{ display: 'block' }}>
                {gps ? `±${n0(gps.acc)} m · ${gps.lat.toFixed(4)}, ${gps.lon.toFixed(4)}` : settings.useGps ? t.sites.gpsSearching : t.sites.gpsOff}
              </span>
            </button>
            <Toggle on={settings.useGps} onChange={(v) => setSettings({ useGps: v })} label="GPS" />
          </div>
        )}
      </div>
      <button
        className="btn btn--block"
        style={{ marginTop: 16 }}
        onClick={() => {
          onClose();
          setTab('places');
        }}
      >
        <IPlus /> {t.sites.manage}
      </button>
      <p className="lead" style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
        {t.sites.allSites}
      </p>
    </Sheet>
  );
}
