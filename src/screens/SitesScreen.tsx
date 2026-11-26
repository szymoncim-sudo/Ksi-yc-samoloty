import maplibregl from '../map/maplibre';
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { distance, n0, n1 } from '../lib/format';
import { circlePolygon } from '../lib/geo';
import { HAS_GPS } from '../lib/platform';
import { fetchElevation, reverseGeocode, searchPlaces, type GeoResult } from '../lib/services';
import { styleFor, type BaseLayer } from '../map/style';
import { useT } from '../i18n';
import { GPS_SITE_ID, useStore, type SiteDef } from '../state/store';
import { IClose, ILayers, ILocate, IPlus, ISearch } from '../components/icons';
import { Range, Seg, Sheet, Stepper, Toggle } from '../components/ui';

interface Draft {
  id: string | null;
  name: string;
  lat: number;
  lon: number;
  ground: number | null;
  groundManual: boolean;
  agl: number;
  reachKm: number;
  enabled: boolean;
}

const toDraft = (s: SiteDef): Draft => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, ground: s.ground, groundManual: s.groundManual, agl: s.agl, reachKm: s.reachKm, enabled: s.enabled });

function Editor({ draft, setDraft, onClose }: { draft: Draft; setDraft: (d: Draft) => void; onClose: () => void }) {
  const t = useT();
  const addSite = useStore((s) => s.addSite);
  const updateSite = useStore((s) => s.updateSite);
  const removeSite = useStore((s) => s.removeSite);
  const setActive = useStore((s) => s.setActiveSite);
  const activeId = useStore((s) => s.activeSiteId);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (draft.groundManual) return;
    let alive = true;
    setLoading(true);
    fetchElevation(draft.lat, draft.lon).then((e) => {
      if (!alive) return;
      setLoading(false);
      if (e !== null) setDraft({ ...draft, ground: e });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.lat, draft.lon, draft.groundManual]);

  const save = (primary = false) => {
    const data = {
      name: draft.name.trim() || t.sites.defaultName,
      lat: draft.lat,
      lon: draft.lon,
      ground: draft.ground,
      groundManual: draft.groundManual,
      agl: draft.agl,
      reachKm: draft.reachKm,
      enabled: draft.enabled,
    };
    let id = draft.id;
    if (id) updateSite(id, data);
    else id = addSite(data);
    if (primary || !activeId) setActive(id);
    onClose();
  };

  return (
    <div>
      <div className="sheet-head">
        <div>
          <h2 className="h1">{draft.id ? t.sites.editSite : t.sites.newSite}</h2>
          <div className="mono fg3" style={{ fontSize: 12, marginTop: 4 }}>
            {draft.lat.toFixed(5)}, {draft.lon.toFixed(5)}
          </div>
        </div>
        <button className="ibtn ibtn--sm" onClick={onClose} aria-label={t.moon.close}>
          <IClose />
        </button>
      </div>
      <div className="form">
        <div className="form__l">{t.sites.name}</div>
        <input className="field" value={draft.name} placeholder={t.sites.namePh} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      <div className="form">
        <div className="form__l">
          <span>{t.sites.ground}</span>
          <b>{loading ? '…' : draft.ground !== null ? `${n0(draft.ground)} ${t.sites.asl}` : t.sites.unknown}</b>
        </div>
        <div className="inline" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <span className="fg3" style={{ fontSize: 12.5 }}>
            {draft.groundManual ? t.sites.groundManual : t.sites.groundAuto}
          </span>
          <Toggle on={draft.groundManual} onChange={(v) => setDraft({ ...draft, groundManual: v })} label={t.sites.groundManual} />
        </div>
        {draft.groundManual && (
          <div style={{ marginTop: 10 }}>
            <Stepper value={draft.ground ?? 0} step={5} min={-430} max={8800} onChange={(v) => setDraft({ ...draft, ground: v })} format={(v) => `${n0(v)} m`} />
          </div>
        )}
      </div>
      <div className="form">
        <div className="form__l">
          <span>{t.sites.eye}</span>
          <b>{n1(draft.agl)} m</b>
        </div>
        <div className="inline">
          <Stepper value={draft.agl} step={1} min={0} max={400} onChange={(v) => setDraft({ ...draft, agl: v })} format={(v) => `${n1(v)} m`} />
          <Seg
            value={draft.agl === 1.7 ? 1.7 : draft.agl === 12 ? 12 : draft.agl === 30 ? 30 : -1}
            onChange={(v) => v > 0 && setDraft({ ...draft, agl: v })}
            options={[
              { value: 1.7, label: t.sites.presetGround },
              { value: 12, label: t.sites.presetBalcony },
              { value: 30, label: t.sites.presetTower },
            ]}
          />
        </div>
        <div className="form__h">{draft.ground !== null ? t.sites.total(n0(draft.ground + draft.agl)) : ''}</div>
      </div>
      <div className="form">
        <div className="form__l">
          <span>{t.sites.reach}</span>
          <b>{draft.reachKm === 0 ? t.sites.stay : distance(draft.reachKm * 1000)}</b>
        </div>
        <Range min={0} max={20} step={0.5} value={draft.reachKm} onChange={(v) => setDraft({ ...draft, reachKm: v })} label={t.sites.reach} />
        <div className="form__h">{t.sites.reachNote}</div>
      </div>
      <div className="opt" style={{ marginTop: 8 }}>
        <div className="opt__m">
          <div className="opt__l">{t.sites.enabled}</div>
        </div>
        <Toggle on={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label={t.sites.enabled} />
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
        <button className="btn btn--solid" onClick={() => save(false)}>
          {t.sites.save}
        </button>
        {draft.id !== activeId && (
          <button className="btn" onClick={() => save(true)}>
            {t.sites.primary}
          </button>
        )}
        {draft.id && (
          <button
            className="btn btn--danger"
            onClick={() => {
              removeSite(draft.id!);
              onClose();
            }}
          >
            {t.sites.remove}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SitesScreen({ active }: { active: boolean }) {
  const t = useT();
  const sites = useStore((s) => s.sites);
  const activeId = useStore((s) => s.activeSiteId);
  const setActive = useStore((s) => s.setActiveSite);
  const updateSite = useStore((s) => s.updateSite);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const gps = useStore((s) => s.gps);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const draftMarker = useRef<maplibregl.Marker | null>(null);
  const ready = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [base, setBase] = useState<BaseLayer>('dark');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);

  const openDraft = async (lat: number, lon: number, name?: string) => {
    setDraft({ id: null, name: name ?? '', lat, lon, ground: null, groundManual: false, agl: 1.7, reachKm: 1, enabled: true });
    if (!name) {
      const n = await reverseGeocode(lat, lon);
      if (n) setDraft((cur) => (cur && cur.id === null && cur.lat === lat && !cur.name ? { ...cur, name: n } : cur));
    }
  };

  function pushReach() {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    (map.getSource('reach') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: sites
        .filter((s) => s.reachKm > 0 && s.enabled)
        .map((s) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circlePolygon(s.lat, s.lon, s.reachKm * 1000)] } })),
    });
  }

  useEffect(() => {
    if (!mapEl.current) return;
    const s0 = sites.find((s) => s.id === activeId) ?? sites[0];
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#050505' } }] },
      center: s0 ? [s0.lon, s0.lat] : [10, 50],
      zoom: s0 ? 11 : 3.5,
      attributionControl: { compact: true },
      maxPitch: 0,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    map.on('style.load', () => {
      if (!map.getSource('reach')) map.addSource('reach', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      if (!map.getLayer('reach-fill')) map.addLayer({ id: 'reach-fill', type: 'fill', source: 'reach', paint: { 'fill-color': '#ecebe5', 'fill-opacity': 0.04 } });
      if (!map.getLayer('reach-line'))
        map.addLayer({ id: 'reach-line', type: 'line', source: 'reach', paint: { 'line-color': '#ecebe5', 'line-opacity': 0.5, 'line-width': 1, 'line-dasharray': [2, 2] } });
      ready.current = true;
      pushReach();
    });
    map.on('click', (e) => openDraft(e.lngLat.lat, e.lngLat.lng));
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    ready.current = false;
    let alive = true;
    styleFor(base).then((st) => alive && map.setStyle(st, { diff: false }));
    return () => {
      alive = false;
    };
  }, [base]);

  useEffect(() => {
    if (active) setTimeout(() => mapRef.current?.resize(), 60);
  }, [active]);

  useEffect(pushReach, [sites]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    markers.current = sites.map((s, i) => {
      const d = document.createElement('div');
      d.innerHTML = `<div class="pin ${s.enabled ? '' : 'pin--off'}">${i + 1}</div>`;
      d.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setDraft(toDraft(s));
      });
      const m = new maplibregl.Marker({ element: d, anchor: 'center', draggable: true }).setLngLat([s.lon, s.lat]).addTo(map);
      m.on('dragend', () => {
        const ll = m.getLngLat();
        updateSite(s.id, { lat: ll.lat, lon: ll.lng, ground: s.groundManual ? s.ground : null });
      });
      return m;
    });
  }, [sites, updateSite]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    draftMarker.current?.remove();
    draftMarker.current = null;
    if (draft && draft.id === null) {
      const d = document.createElement('div');
      d.innerHTML = '<div class="pin pin--draft">+</div>';
      draftMarker.current = new maplibregl.Marker({ element: d, anchor: 'center' }).setLngLat([draft.lon, draft.lat]).addTo(map);
    }
  }, [draft?.lat, draft?.lon, draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      const c = mapRef.current?.getCenter();
      searchPlaces(q, c ? { lat: c.lat, lon: c.lng } : undefined, ctl.signal)
        .then(setResults)
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q]);

  const locateMe = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14 });
        openDraft(pos.coords.latitude, pos.coords.longitude);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div className="st-map">
        <div ref={mapEl} className="map" />
      </div>
      <div className="st-head">
        <div className="search">
          <ISearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.sites.search} enterKeyHint="search" />
          {q && (
            <button onClick={() => setQ('')} aria-label="×" className="fg3">
              <IClose width={16} height={16} />
            </button>
          )}
        </div>
        {results.length > 0 && (
          <div className="results">
            {results.map((r) => (
              <button
                key={`${r.lat},${r.lon}`}
                onClick={() => {
                  mapRef.current?.flyTo({ center: [r.lon, r.lat], zoom: 13.5 });
                  setQ('');
                  setResults([]);
                  openDraft(r.lat, r.lon, r.name);
                }}
              >
                {r.name}
                <small>{r.detail}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="st-tools">
        <button className="ibtn" onClick={() => setBase(base === 'dark' ? 'sat' : base === 'sat' ? 'topo' : 'dark')} aria-label={t.transit.layers} title={t.transit.layers}>
          <ILayers />
        </button>
        {HAS_GPS && (
          <button className="ibtn" onClick={locateMe} aria-label={t.sites.gps} title={t.sites.gps}>
            <ILocate />
          </button>
        )}
      </div>
      <div className="st-list">
        <div className="scroll">
          <h1 className="h1">{t.sites.title}</h1>
          <p className="lead" style={{ marginBottom: 14 }}>
            {t.sites.sub}
          </p>
          <Seg
            block
            value={base}
            onChange={setBase}
            options={[
              { value: 'dark', label: t.sites.layerMap },
              { value: 'sat', label: t.sites.layerSat },
              { value: 'topo', label: t.sites.layerTopo },
            ]}
          />
          <div style={{ marginTop: 8 }}>
            {sites.map((s, i) => (
              <div key={s.id} className={`site ${s.id === activeId ? 'is-primary' : ''} ${s.enabled ? '' : 'is-off'}`}>
                <button
                  className="site__i"
                  onClick={() => {
                    mapRef.current?.flyTo({ center: [s.lon, s.lat], zoom: 13 });
                    setActive(s.id);
                  }}
                >
                  {i + 1}
                </button>
                <button style={{ minWidth: 0 }} onClick={() => setDraft(toDraft(s))}>
                  <span className="site__n" style={{ display: 'block' }}>
                    {s.name}
                  </span>
                  <span className="site__m" style={{ display: 'block' }}>
                    {s.ground !== null ? `${n0(s.ground + s.agl)} ${t.sites.asl}` : t.sites.elevPending}
                    {s.reachKm ? ` · ${t.sites.reachShort(distance(s.reachKm * 1000))}` : ''}
                  </span>
                </button>
                <Toggle on={s.enabled} onChange={(v) => updateSite(s.id, { enabled: v })} label={t.sites.enabled} />
              </div>
            ))}
            {HAS_GPS && (
              <div className={`site ${activeId === GPS_SITE_ID ? 'is-primary' : ''}`}>
                <span className="site__i">
                  <ILocate width={15} height={15} style={{ verticalAlign: -3 }} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="site__n" style={{ display: 'block' }}>
                    {t.sites.gps}
                  </span>
                  <span className="site__m" style={{ display: 'block' }}>
                    {gps ? `±${n0(gps.acc)} m${gps.ground !== null ? ` · ${n0(gps.ground)} ${t.sites.asl}` : ''}` : t.sites.gpsSub}
                  </span>
                </span>
                <Toggle on={settings.useGps} onChange={(v) => setSettings({ useGps: v })} label="GPS" />
              </div>
            )}
          </div>
          <button
            className="btn btn--block"
            style={{ marginTop: 16 }}
            onClick={() => {
              const c = mapRef.current?.getCenter();
              if (c) openDraft(c.lat, c.lng);
            }}
          >
            <IPlus /> {t.sites.addCentre}
          </button>
          <p className="lead" style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 14 }}>
            {t.sites.note}
          </p>
        </div>
      </div>
      <Sheet open={!!draft} onClose={() => setDraft(null)}>
        {draft && <Editor draft={draft} setDraft={setDraft} onClose={() => setDraft(null)} />}
      </Sheet>
    </div>
  );
}
