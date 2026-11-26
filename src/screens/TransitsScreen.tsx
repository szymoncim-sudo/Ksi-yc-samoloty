import { useEffect, useMemo, useRef, useState } from 'react';
import { typeInfo } from '../lib/aircraft';
import { moonAltAz } from '../lib/astro';
import { altitude, arc, clock, clockTenths, compass16, compass8i, distance, fmtTime, n0, n1, n2, pct, speed } from '../lib/format';
import { fetchRoute, type RouteInfo } from '../lib/services';
import type { Aircraft, Pass, Site } from '../lib/transit';
import { RadarMap, type RadarMapApi } from '../map/RadarMap';
import type { BaseLayer } from '../map/style';
import { useT, type Dict } from '../i18n';
import { engineSites, refreshNow, startDemo } from '../state/feed';
import { useStore } from '../state/store';
import { errorText } from '../components/moon';
import { IBands, IChevronDown, IClose, ILayers, ILocate, IRefresh } from '../components/icons';
import { SitePicker } from '../components/SitePicker';
import { TransitPreview } from '../components/TransitPreview';
import { Section, Sheet, useMedia, useNow } from '../components/ui';

const clockHour = (deg: number) => {
  const h = Math.round((((deg % 360) + 360) % 360) / 30) % 12;
  return h === 0 ? 12 : h;
};

function acName(ac: Aircraft | undefined, hex: string) {
  return ac?.callsign || ac?.reg || hex.toUpperCase();
}

function acType(t: Dict, ac: Aircraft | undefined) {
  const ti = typeInfo(ac?.type, ac?.category);
  return ti.name || t.aircraftCat[ti.cat];
}

function Feed() {
  const t = useT();
  const feed = useStore((s) => s.feed);
  const now = useNow(1000);
  const age = feed.fetchedAt ? Math.round((now - feed.fetchedAt) / 1000) : null;
  let dot = 'dot';
  let text = t.transit.connecting;
  if (feed.status === 'ok') {
    dot = age !== null && age > 40 ? 'dot dot--warn' : 'dot dot--live';
    text = `${t.transit.status(feed.count)}${age !== null ? ` · ${t.transit.ageS(age)}` : ''}`;
  } else if (feed.status === 'paused') text = t.transit.moonDownTitle;
  else if (feed.status === 'error') {
    dot = 'dot dot--err';
    text = errorText(t, feed.error);
  } else if (feed.reason === 'no-sites') text = t.transit.noSitesTitle;
  return (
    <button className="feed" onClick={() => refreshNow()} title={t.transit.refresh}>
      <span className={dot} />
      <span>{text}</span>
    </button>
  );
}

function PassRow({ p, ac, now, sel, onClick }: { p: Pass; ac?: Aircraft; now: number; sel: boolean; onClick: () => void }) {
  const t = useT();
  const units = useStore((s) => s.settings.units);
  const dt = p.t - now;
  return (
    <button className={`row row--${p.kind} ${sel ? 'is-sel' : ''}`} onClick={onClick}>
      <span className="row__in">
        {dt > 0 ? clock(dt) : t.detail.now}
        <small>{fmtTime(p.t * 1000, true)}</small>
      </span>
      <span className="row__f">
        <b>{acName(ac, p.hex)}</b>
        <span>
          {acType(t, ac)} · {ac ? altitude(ac.altFt, units) : ''}
          {p.kind === 'reach' && p.move ? ` · ${distance(p.move.distM)} ${compass16(p.move.bearing)}` : ` · ${distance(p.rangeM)}`}
        </span>
      </span>
      <span className="row__r">
        <span className={`tag tag--${p.kind}`}>{t.transit.kind[p.kind]}</span>
        <span className="row__p">{p.probability < 0.005 ? '<1%' : pct(p.probability)}</span>
      </span>
    </button>
  );
}

function PassDetail({ p, onMap, onClose }: { p: Pass; onMap: () => void; onClose: () => void }) {
  const t = useT();
  const ac = useStore((s) => s.aircraft.find((a) => a.hex === p.hex));
  const units = useStore((s) => s.settings.units);
  const siteDefs = useStore((s) => s.sites);
  const settings = useStore((s) => s.settings);
  const gps = useStore((s) => s.gps);
  const site = useMemo(() => engineSites({ sites: siteDefs, settings, gps }).find((s) => s.id === p.siteId), [siteDefs, settings, gps, p.siteId]);
  const now = useNow(100) / 1000;
  const [route, setRoute] = useState<RouteInfo | null>(null);
  useEffect(() => {
    setRoute(null);
    if (ac?.callsign && p.hex !== 'demo01') fetchRoute(ac.callsign).then(setRoute);
  }, [ac?.callsign, p.hex]);
  const ti = typeInfo(ac?.type, ac?.category);
  const dt = p.t - now;
  const desc = ac?.desc ? ac.desc.toLowerCase().replace(/(^|[\s-])\S/g, (m) => m.toUpperCase()) : ti.name || t.aircraftCat[ti.cat];
  const onAxis = p.move ? p.move.distM < p.move.halfWidthM * 0.35 : false;
  return (
    <div>
      <div className="sheet-head">
        <div className="pd-tags">
          <span className={`tag tag--${p.kind}`}>{t.transit.kind[p.kind]}</span>
          {p.hex === 'demo01' && <span className="tag">{t.detail.simulation}</span>}
          {ac?.mil && <span className="tag">{t.detail.military}</span>}
        </div>
        <button className="ibtn ibtn--sm" onClick={onClose} aria-label={t.moon.close}>
          <IClose />
        </button>
      </div>
      <div className="pd-id">{acName(ac, p.hex)}</div>
      <div className="pd-type">
        {desc}
        {ac?.reg ? ` · ${ac.reg}` : ''}
      </div>
      {route && (route.from || route.to) && (
        <div className="pd-route">
          {route.from?.code ?? '—'} → {route.to?.code ?? '—'}
          <span className="fg3">
            {' '}
            {route.from?.city ?? ''} – {route.to?.city ?? ''}
          </span>
        </div>
      )}
      <div className="pd-count">
        <div>
          <div className={`pd-count__v ${dt < 30 && dt > 0 ? 'is-soon' : ''}`}>{dt > 0 ? clockTenths(dt) : t.detail.now}</div>
          <div className="pd-count__at">
            {fmtTime(p.t * 1000, true)} · {site?.name === 'GPS' ? t.myLocation : site?.name}
          </div>
        </div>
        <div className="chance" style={{ ['--v' as string]: `${Math.round(p.probability * 100)}%` }}>
          <b>{pct(p.probability)}</b>
          <small>{t.transit.colChance}</small>
          <i />
        </div>
      </div>
      <TransitPreview p={p} ac={ac} site={site} />
      <div className="figures">
        <div className="figure">
          <div className="figure__k">{p.kind === 'transit' ? t.detail.onDisc : t.detail.clearance}</div>
          <div className="figure__v">{p.kind === 'transit' ? `${n2(p.durationSec)} s` : arc(Math.max(0, p.sepDeg - p.moonRadiusDeg))}</div>
          <div className="figure__s">{p.kind === 'transit' ? t.detail.fromCentre(n0((p.sepDeg / p.moonRadiusDeg) * 100)) : t.detail.centreSep(arc(p.sepDeg))}</div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.detail.range}</div>
          <div className="figure__v">{distance(p.rangeM)}</div>
          <div className="figure__s">{t.detail.alt(ac ? altitude(ac.altFt, units) : `${n0(p.acHeightM)} m`)}</div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.detail.moonAlt}</div>
          <div className="figure__v">{n1(p.moonAlt)}°</div>
          <div className="figure__s">{t.detail.azimuth(`${n0(p.moonAz)}° ${compass16(p.moonAz)}`)}</div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.detail.silhouette}</div>
          <div className="figure__v">{arc(p.angularSpanArcmin / 60)}</div>
          <div className="figure__s">{t.detail.silhouetteSub(n0(ti.span), n0((p.angularSpanArcmin / (p.moonRadiusDeg * 120)) * 100))}</div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.detail.angSpeed}</div>
          <div className="figure__v">{n2(p.relRateDegS)}°/s</div>
          <div className="figure__s">{ac ? speed(ac.gs, units) : ''}</div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.detail.uncertainty}</div>
          <div className="figure__v">±{distance(p.sigmaM)}</div>
          <div className="figure__s">{ac?.altSource === 'geom' ? t.detail.gnss : t.detail.baro}</div>
        </div>
      </div>
      {p.move && (
        <Section title={t.detail.where} className="sec--flush">
          <div className="stand">
            <svg viewBox="0 0 56 56" width="56" height="56">
              <circle cx="28" cy="28" r="26" fill="none" stroke="#2e2e2b" />
              <text x="28" y="9" textAnchor="middle" fill="#63625c" style={{ font: '500 7px var(--mono)' }}>
                N
              </text>
              {onAxis ? (
                <g fill="none" stroke="#ff6a1f">
                  <circle cx="28" cy="28" r="12" />
                  <circle cx="28" cy="28" r="5" />
                </g>
              ) : (
                <g transform={`rotate(${p.move.bearing} 28 28)`}>
                  <path d="M28 10 34.5 24 29.5 22.5V44h-3V22.5L21.5 24Z" fill="#ecebe5" />
                </g>
              )}
            </svg>
            <div>
              <b>{onAxis ? t.detail.onAxis : t.detail.walk(distance(p.move.distM), t.compass[compass8i(p.move.bearing)])}</b>
              <p>{t.detail.band(distance(p.move.halfWidthM * 2), fmtTime(p.move.tCenter * 1000, true))}</p>
              <button className="btn btn--sm" onClick={onMap}>
                {t.detail.showOnMap}
              </button>
            </div>
          </div>
        </Section>
      )}
      <Section title={t.detail.tips}>
        <ol className="notes">
          <li>{t.detail.tipAim(n0(p.moonAz), t.compass[compass8i(p.moonAz)], n0(p.moonAlt), clockHour(p.pathAngle + 180), clockHour(p.pathAngle))}</li>
          <li>{t.detail.tipShutter(p.durationSec ? n2(p.durationSec) : null)}</li>
          <li>{t.detail.tipBurst(distance(p.sigmaM))}</li>
          <li>{t.detail.tipRefresh}</li>
        </ol>
      </Section>
    </div>
  );
}

type Snap = 'peek' | 'half' | 'full';

export default function TransitsScreen({ active }: { active: boolean }) {
  const t = useT();
  const prediction = useStore((s) => s.prediction);
  const aircraft = useStore((s) => s.aircraft);
  const selectedKey = useStore((s) => s.selectedPassKey);
  const selectPass = useStore((s) => s.selectPass);
  const activeSiteId = useStore((s) => s.activeSiteId);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const gps = useStore((s) => s.gps);
  const siteDefs = useStore((s) => s.sites);
  const feed = useStore((s) => s.feed);
  const sites = useMemo(() => engineSites({ sites: siteDefs, settings, gps }), [siteDefs, settings, gps]);
  const now = useNow(1000) / 1000;
  const desktop = useMedia('(min-width: 1024px)');
  const [base, setBase] = useState<BaseLayer>('dark');
  const [picker, setPicker] = useState(false);
  const [snap, setSnap] = useState<Snap>('peek');
  const [dragY, setDragY] = useState<number | null>(null);
  const [minimized, setMinimized] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const api = useRef<RadarMapApi | null>(null);
  const drag = useRef<{ y0: number; base: number } | null>(null);
  useEffect(() => setMinimized(false), [selectedKey]);

  const passes = (prediction?.passes ?? []).filter((p) => p.t > now - 3);
  const selected = (prediction?.passes ?? []).find((p) => p.key === selectedKey) ?? null;
  const site = sites.find((s) => s.id === activeSiteId) ?? sites[0];
  const moon = site ? moonAltAz(new Date(Math.floor(now / 15) * 15000), { lat: site.lat, lon: site.lon, elev: site.elevMsl }) : null;

  const snapY = (s: Snap) => {
    const h = panelRef.current?.clientHeight ?? 600;
    const tb = (document.querySelector('.tabs') as HTMLElement | null)?.offsetHeight ?? 56;
    if (s === 'full') return 0;
    if (s === 'half') return Math.round(h * 0.45);
    return Math.max(0, h - tb - 150);
  };
  const translate = desktop ? 0 : (dragY ?? snapY(snap));

  const grouped = useMemo(() => {
    const m = new Map<string, Pass[]>();
    for (const p of passes) {
      if (!m.has(p.siteId)) m.set(p.siteId, []);
      m.get(p.siteId)!.push(p);
    }
    return m;
  }, [passes]);
  const nTransit = passes.filter((p) => p.kind === 'transit').length;

  let emptyTitle = t.transit.noneTitle;
  let emptyText = t.transit.none;
  if (feed.status === 'paused') {
    emptyTitle = t.transit.moonDownTitle;
    emptyText = t.transit.moonDown;
  } else if (feed.status === 'error') {
    emptyTitle = t.transit.noData;
    emptyText = errorText(t, feed.error);
  } else if (feed.reason === 'no-sites') {
    emptyTitle = t.transit.noSitesTitle;
    emptyText = t.transit.noSites;
  }

  return (
    <div style={{ position: 'absolute', inset: 0, ['--attrib-b' as string]: desktop ? '0px' : 'calc(var(--tab-h) + 150px)' }}>
      <div className="tr-map">
        <RadarMap
          active={active}
          sites={sites}
          activeSiteId={site?.id ?? null}
          aircraft={aircraft}
          prediction={prediction}
          selectedKey={selectedKey}
          base={base}
          showAmbient={settings.showAmbient}
          units={settings.units}
          gps={gps ? { lat: gps.lat, lon: gps.lon } : null}
          standLabel={(m) => `${distance(m)}`}
          onSelect={(k) => selectPass(k)}
          apiRef={api}
        />
      </div>
      <div className="tr-head">
        <div className="tr-head__r1">
          <button className="site-btn" style={{ color: 'var(--fg)', maxWidth: '58%' }} onClick={() => setPicker(true)}>
            <span>{site ? (site.id === 'gps' ? t.myLocation : site.name) : t.noSite}</span>
            <IChevronDown />
          </button>
          <Feed />
        </div>
        <div className="tr-head__r2">
          {moon && (
            <span>
              ☾ {n1(moon.alt)}° · {n0(moon.az)}° {compass16(moon.az)}
            </span>
          )}
          <span>{t.transit.window(settings.horizonMin)}</span>
          {nTransit > 0 && <span className="sig">{t.transit.count(nTransit)}</span>}
        </div>
      </div>
      <div className="map-tools">
        <button className="ibtn" onClick={() => site && api.current?.flyToSite(site)} aria-label={t.transit.centre} title={t.transit.centre}>
          <ILocate />
        </button>
        <button
          className={`ibtn ${settings.showAmbient ? 'is-on' : ''}`}
          onClick={() => setSettings({ showAmbient: !settings.showAmbient })}
          aria-label={t.transit.corridors}
          title={t.transit.corridors}
        >
          <IBands />
        </button>
        <button className="ibtn" onClick={() => setBase(base === 'dark' ? 'sat' : base === 'sat' ? 'topo' : 'dark')} aria-label={t.transit.layers} title={t.transit.layers}>
          <ILayers />
        </button>
        <button className="ibtn" onClick={() => refreshNow()} aria-label={t.transit.refresh} title={t.transit.refresh}>
          <IRefresh />
        </button>
      </div>

      <div ref={panelRef} className={`board ${dragY !== null ? 'is-drag' : ''}`} style={{ transform: desktop ? undefined : `translateY(${translate}px)` }}>
        <div
          className="board__head"
          onPointerDown={(e) => {
            if (desktop) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { y0: e.clientY, base: snapY(snap) };
            setDragY(snapY(snap));
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setDragY(Math.max(0, Math.min(snapY('peek') + 40, drag.current.base + e.clientY - drag.current.y0)));
          }}
          onPointerUp={(e) => {
            if (!drag.current) return;
            const moved = e.clientY - drag.current.y0;
            const y = drag.current.base + moved;
            drag.current = null;
            setDragY(null);
            if (Math.abs(moved) < 6) {
              setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek');
              return;
            }
            let best: Snap = 'peek';
            let bd = Infinity;
            for (const o of ['full', 'half', 'peek'] as Snap[]) {
              const d = Math.abs(snapY(o) - y);
              if (d < bd) {
                bd = d;
                best = o;
              }
            }
            setSnap(best);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragY(null);
          }}
        >
          <div className="sheet__grab" />
          <div className="board__title">
            <b>{t.transit.title}</b>
            <span>{t.transit.window(settings.horizonMin)}</span>
          </div>
        </div>
        {passes.length > 0 && (
          <div className="board__cols">
            <span>{t.transit.colIn}</span>
            <span>{t.transit.colFlight}</span>
            <span>{t.transit.colChance}</span>
          </div>
        )}
        <div className="board__list">
          {passes.length === 0 && (
            <div className="board__empty">
              <b>{emptyTitle}</b>
              <p>{feed.status === 'ok' ? `${t.transit.tracking(feed.count)}. ${emptyText}` : emptyText}</p>
              {feed.reason === 'no-sites' ? (
                <button className="btn btn--solid" onClick={() => useStore.getState().setTab('places')}>
                  {t.sites.newSite}
                </button>
              ) : (
                (feed.status === 'ok' || feed.status === 'loading') && (
                  <button
                    className="btn btn--sm"
                    onClick={() => {
                      if (startDemo())
                        setTimeout(() => {
                          const d = useStore.getState().prediction?.passes.find((x) => x.hex === 'demo01');
                          if (d) useStore.getState().selectPass(d.key);
                        }, 400);
                    }}
                  >
                    {t.transit.simulate}
                  </button>
                )
              )}
            </div>
          )}
          {[...grouped.entries()].map(([sid, list]) => (
            <div key={sid}>
              {sites.length > 1 && <div className="board__group">{sid === 'gps' ? t.myLocation : sites.find((s) => s.id === sid)?.name}</div>}
              {list.map((p) => (
                <PassRow key={p.key} p={p} ac={aircraft.find((a) => a.hex === p.hex)} now={now} sel={p.key === selectedKey} onClick={() => selectPass(p.key)} />
              ))}
            </div>
          ))}
          {passes.length > 0 && <div className="board__note">{t.transit.chanceNote}</div>}
        </div>
      </div>

      <Sheet open={!!selected && !minimized} onClose={() => selectPass(null)}>
        {selected && (
          <PassDetail
            p={selected}
            onClose={() => selectPass(null)}
            onMap={() => {
              const s = sites.find((x) => x.id === selected.siteId) as Site | undefined;
              if (s) api.current?.fitPass(selected, s);
              if (!desktop) {
                setMinimized(true);
                setSnap('peek');
              }
            }}
          />
        )}
      </Sheet>
      {selected && minimized && (
        <button className="btn btn--solid" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(var(--tab-h) + 162px)', zIndex: 30 }} onClick={() => setMinimized(false)}>
          {t.detail.back}
        </button>
      )}
      <SitePicker open={picker} onClose={() => setPicker(false)} />
    </div>
  );
}
