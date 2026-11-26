import { useEffect, useMemo, useRef, useState } from 'react';
import {
  altitudeCurve,
  eclipseDiagram,
  lunarEclipses,
  moonQuarters,
  QUARTER_KEYS,
  type EclipseInfo,
  type MoonEvent,
  type MoonInfo,
  type Place,
  type RiseSet,
} from '../lib/astro';
import { typeInfo } from '../lib/aircraft';
import { arc, clock, compass16, fmtDate, fmtDateTime, fmtMonth, fmtTime, n0, n1, n2, pct, relDays } from '../lib/format';
import { fetchClouds, type CloudForecast } from '../lib/services';
import { getMoonEngine, type MoonParams } from '../moon/MoonEngine';
import { useT, type Dict } from '../i18n';
import { useStore } from '../state/store';
import { IApogee, IChevronLeft, IChevronRight, IClose, IEclipse, IExpand, IPause, IPerigee, IPlay, IReset, ITag } from './icons';
import { MoonThumb } from './MoonThumb';
import { Section, Seg, useNow } from './ui';

// ------------------------------------------------------------------ engine hosting
// One WebGL canvas is shared; the most recently mounted host owns it and its parameters.
interface Host {
  el: HTMLElement;
  apply: () => void;
}
const hosts: Host[] = [];
function pushHost(h: Host) {
  hosts.push(h);
  getMoonEngine(useStore.getState().settings.quality).attach(h.el);
  h.apply();
}
function popHost(h: Host) {
  const i = hosts.lastIndexOf(h);
  if (i >= 0) hosts.splice(i, 1);
  const top = hosts[hosts.length - 1];
  if (top) {
    getMoonEngine().attach(top.el);
    top.apply();
  }
}

export function useMoonReady() {
  const [ready, setReady] = useState(getMoonEngine(useStore.getState().settings.quality).ready);
  useEffect(() => {
    const off = getMoonEngine().on((e) => setReady(e.ready));
    return () => {
      off();
    };
  }, []);
  return ready;
}

export function MoonCanvas(props: { params: MoonParams; fill: number; offsetY: number; interactive?: boolean; onTap?: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const ready = useMoonReady();
  const latest = useRef(props);
  latest.current = props;
  const host = useRef<Host | null>(null);
  const p = props.params;
  const key = [p.date.getTime(), p.place?.lat, p.place?.lon, p.place?.elev, p.orientation, p.atmosphere, p.earthshine, p.labels, p.labelLang, p.fullLight, props.fill, props.offsetY, props.interactive].join('|');
  useEffect(() => {
    const h: Host = {
      el: ref.current!,
      apply: () => {
        const q = latest.current;
        const eng = getMoonEngine();
        eng.setInteractive(!!q.interactive);
        eng.onTap = () => latest.current.onTap?.();
        eng.setLayout({ fill: q.fill, offsetY: q.offsetY });
        eng.setParams(q.params);
      },
    };
    host.current = h;
    pushHost(h);
    return () => popHost(h);
  }, []);
  useEffect(() => {
    if (host.current && hosts[hosts.length - 1] === host.current) host.current.apply();
  }, [key]);
  return <div ref={ref} className={`hero__gl ${ready ? 'is-ready' : ''} ${props.className ?? ''}`} />;
}

export function Explorer({ base, onClose }: { base: MoonParams; onClose: () => void }) {
  const t = useT();
  const [full, setFull] = useState(false);
  const [orient, setOrient] = useState<'horizon' | 'north'>(base.orientation);
  const [labels, setLabels] = useState(true);
  const lang = useStore((s) => s.settings.lang);
  return (
    <div className="explorer">
      <MoonCanvas
        params={{ ...base, orientation: base.place ? orient : 'north', labels, labelLang: lang, fullLight: full }}
        fill={0.86}
        offsetY={0}
        interactive
        className="explorer__gl"
      />
      <div className="explorer__bar">
        <span className="mono fg3" style={{ fontSize: 12 }}>
          {fmtDateTime(base.date)}
        </span>
        <button className="ibtn" onClick={onClose} aria-label={t.moon.close}>
          <IClose />
        </button>
      </div>
      <div className="explorer__ctl">
        <Seg
          value={full ? 'full' : 'sun'}
          onChange={(v) => setFull(v === 'full')}
          options={[
            { value: 'sun', label: t.moon.sunlit },
            { value: 'full', label: t.moon.fullLight },
          ]}
        />
        {base.place && (
          <Seg
            value={orient}
            onChange={setOrient}
            options={[
              { value: 'horizon', label: t.moon.sky },
              { value: 'north', label: t.moon.northUp },
            ]}
          />
        )}
        <button className={`ibtn ${labels ? 'is-on' : ''}`} onClick={() => setLabels(!labels)} aria-label={t.moon.labels} title={t.moon.labels}>
          <ITag />
        </button>
        <button className="ibtn" onClick={() => getMoonEngine().resetView()} aria-label={t.moon.reset} title={t.moon.reset}>
          <IReset />
        </button>
      </div>
    </div>
  );
}

export function HeroHint() {
  const t = useT();
  return (
    <div className="hero__hint">
      <IExpand /> {t.moon.explore}
    </div>
  );
}

// ------------------------------------------------------------------ time ruler
const PX_PER_HOUR = 9;
const RANGE_MS = 60 * 86400000;

export function TimeRuler({ liveNow }: { liveNow: number }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const offset = useStore((s) => s.timeOffsetMs);
  const setOffset = useStore((s) => s.setTimeOffset);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef({ dragging: false, x: 0, v: 0, lastT: 0, raf: 0, playing: false, offset });
  const [playing, setPlaying] = useState(false);
  st.current.offset = offset;
  const dayKey = Math.floor(liveNow / 86400000);
  const quarters = useMemo(() => moonQuarters(new Date(dayKey * 86400000 - RANGE_MS - 3 * 86400000), 40), [dayKey]);

  const draw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const w = c.clientWidth, h = c.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const sel = liveNow + st.current.offset;
    const halfH = (w / 2 / PX_PER_HOUR) * 3600000;
    const start = new Date(sel - halfH);
    start.setMinutes(0, 0, 0);
    const xOf = (tt: number) => w / 2 + ((tt - sel) / 3600000) * PX_PER_HOUR;
    ctx.font = '400 10.5px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    const dows = (DOW_FULL[lang] ?? DOW_FULL.en);
    for (let tt = start.getTime(); tt < sel + halfH + 3600000; tt += 3600000) {
      const d = new Date(tt);
      const hr = d.getHours();
      const x = Math.round(xOf(tt)) + 0.5;
      let len = 5, col = '#2e2e2b';
      if (hr % 6 === 0) {
        len = 9;
        col = '#454540';
      }
      if (hr === 0) {
        len = 44;
        col = '#63625c';
        ctx.fillStyle = '#a09f98';
        ctx.fillText(`${dows[d.getDay()]} ${d.getDate()}`, x + 5, h - 6);
      }
      ctx.fillStyle = col;
      ctx.fillRect(x - 0.5, 0, 1, len);
    }
    for (const q of quarters) {
      const x = xOf(q.date.getTime());
      if (x < -10 || x > w + 10) continue;
      const y = 22, r = 4;
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#ecebe5';
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ecebe5';
      if (q.quarter === 2) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (q.quarter !== 0) {
        ctx.beginPath();
        ctx.arc(x, y, r, q.quarter === 1 ? -Math.PI / 2 : Math.PI / 2, q.quarter === 1 ? Math.PI / 2 : (3 * Math.PI) / 2);
        ctx.fill();
      }
    }
    const xn = xOf(liveNow);
    if (xn > 0 && xn < w && Math.abs(st.current.offset) > 60000) {
      ctx.fillStyle = '#ecebe5';
      ctx.fillRect(Math.round(xn) - 2, 0, 4, 4);
    }
  };

  useEffect(draw);
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clamp = (v: number) => Math.max(-RANGE_MS, Math.min(RANGE_MS, v));
  const animate = () => {
    const s = st.current;
    s.raf = 0;
    if (s.playing) {
      setOffset(clamp(s.offset + 1800000));
      s.raf = requestAnimationFrame(animate);
      return;
    }
    if (!s.dragging && Math.abs(s.v) > 0.05) {
      setOffset(clamp(s.offset - (s.v / PX_PER_HOUR) * 3600000));
      s.v *= 0.93;
      s.raf = requestAnimationFrame(animate);
    }
  };
  const togglePlay = () => {
    const s = st.current;
    s.playing = !s.playing;
    setPlaying(s.playing);
    if (s.playing && !s.raf) s.raf = requestAnimationFrame(animate);
  };
  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);

  const live = Math.abs(offset) < 60000;
  const rel = (() => {
    if (live) return t.moon.live;
    const a = Math.abs(offset);
    const d = Math.floor(a / 86400000), hh = Math.floor((a % 86400000) / 3600000), mm = Math.floor((a % 3600000) / 60000);
    const body = d > 0 ? `${d} d ${hh} h` : hh > 0 ? `${hh} h ${mm} min` : `${mm} min`;
    return `${offset > 0 ? '+' : '−'}${body}`;
  })();

  return (
    <div className="ruler">
      <div className="ruler__top">
        <div style={{ minWidth: 0 }}>
          <span className="ruler__time">{fmtDateTime(liveNow + offset)}</span>
          <span className={`ruler__rel ${live ? 'ruler__rel--live' : ''}`}>{rel}</span>
        </div>
        <div className="inline" style={{ flexWrap: 'nowrap' }}>
          <button className={`ibtn ibtn--sm ${playing ? 'is-on' : ''}`} onClick={togglePlay} aria-label={t.moon.play} title={t.moon.play}>
            {playing ? <IPause /> : <IPlay />}
          </button>
          {!live && (
            <button className="btn btn--sm" onClick={() => setOffset(0)}>
              {t.moon.now}
            </button>
          )}
        </div>
      </div>
      <div
        className="ruler__track"
        onPointerDown={(e) => {
          const s = st.current;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          s.dragging = true;
          s.x = e.clientX;
          s.v = 0;
          s.lastT = performance.now();
          if (s.playing) togglePlay();
        }}
        onPointerMove={(e) => {
          const s = st.current;
          if (!s.dragging) return;
          const dx = e.clientX - s.x;
          s.x = e.clientX;
          const now = performance.now();
          s.v = (dx / Math.max(1, now - s.lastT)) * 16;
          s.lastT = now;
          setOffset(clamp(s.offset - (dx / PX_PER_HOUR) * 3600000));
        }}
        onPointerUp={() => {
          st.current.dragging = false;
          if (!st.current.raf) st.current.raf = requestAnimationFrame(animate);
        }}
        onPointerCancel={() => {
          st.current.dragging = false;
        }}
      >
        <canvas ref={canvasRef} />
        <div className="ruler__needle" />
      </div>
    </div>
  );
}

const DOW_FULL: Record<string, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  pl: ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'],
};

// ------------------------------------------------------------------ next transit
export function NextTransit({ now }: { now: number }) {
  const t = useT();
  const prediction = useStore((s) => s.prediction);
  const feed = useStore((s) => s.feed);
  const aircraft = useStore((s) => s.aircraft);
  const activeSiteId = useStore((s) => s.activeSiteId);
  const sites = useStore((s) => s.sites);
  const setTab = useStore((s) => s.setTab);
  const selectPass = useStore((s) => s.selectPass);
  const nowS = now / 1000;
  const passes = (prediction?.passes ?? []).filter((p) => p.t > nowS - 1 && (p.kind === 'transit' || p.probability >= 0.03));
  const best = passes.find((p) => p.siteId === activeSiteId && p.kind === 'transit') ?? passes.find((p) => p.kind === 'transit') ?? passes[0];
  const go = () => {
    if (best) selectPass(best.key);
    setTab(feed.reason === 'no-sites' ? 'places' : 'radar');
  };
  let body: React.ReactNode;
  if (best) {
    const ac = aircraft.find((a) => a.hex === best.hex);
    const ti = typeInfo(ac?.type, ac?.category);
    const site = sites.find((s) => s.id === best.siteId)?.name ?? t.myLocation;
    body = (
      <button className="np" onClick={go}>
        <span className={`np__cd ${best.kind === 'transit' ? 'np__cd--sig' : ''}`}>{clock(best.t - nowS)}</span>
        <span className="np__f">
          <b>
            {ac?.callsign || ac?.reg || best.hex.toUpperCase()} <span className={`tag tag--${best.kind}`} style={{ display: 'inline-flex', marginLeft: 6, verticalAlign: 2 }}>{t.transit.kind[best.kind]}</span>
          </b>
          <span>
            {ti.name || t.aircraftCat[ti.cat]} · {site} · {fmtTime(best.t * 1000, true)}
          </span>
        </span>
        <span className="np__p">
          {best.probability < 0.005 ? '<1%' : pct(best.probability)}
          <small>{t.transit.colChance}</small>
        </span>
      </button>
    );
  } else {
    let text = t.transit.tracking(feed.count) + ' · ' + t.transit.none;
    if (feed.status === 'paused') text = t.transit.moonDown;
    else if (feed.status === 'error') text = errorText(t, feed.error);
    else if (feed.reason === 'no-sites') text = t.transit.noSites;
    else if (feed.status !== 'ok') text = t.transit.connecting;
    body = (
      <button className="empty-line" onClick={go} style={{ textAlign: 'left' }}>
        {text}
      </button>
    );
  }
  return (
    <Section title={t.transit.next} aside={passes.length > 1 ? t.transit.more(passes.length - 1) : undefined}>
      {body}
    </Section>
  );
}

export function errorText(t: Dict, code?: string) {
  if (!code) return t.transit.noData;
  if (code === 'E_OFFLINE') return t.errors.offline;
  if (code === 'E_BAD') return t.errors.bad;
  const m = code.match(/^E_HTTP_(\d+)/);
  if (m) return t.errors.server(Number(m[1]));
  return code;
}

// ------------------------------------------------------------------ sky
function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function Dial({ moon, size = 124 }: { moon: MoonInfo; size?: number }) {
  const c = size / 2;
  const R = size / 2 - 12;
  const pos = (alt: number, az: number) => {
    const r = (R * (90 - Math.max(alt, 0))) / 90;
    const a = (az * Math.PI) / 180;
    return [c + r * Math.sin(a), c - r * Math.cos(a)];
  };
  const [mx, my] = pos(moon.alt, moon.az);
  const [sx, sy] = pos(moon.sunAlt, moon.sunAz);
  const up = moon.alt > 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={c} cy={c} r={R} fill="none" stroke="#454540" />
      {[30, 60].map((a) => (
        <circle key={a} cx={c} cy={c} r={(R * (90 - a)) / 90} fill="none" stroke="#1e1e1c" />
      ))}
      <path d={`M${c} ${c - R}V${c + R}M${c - R} ${c}H${c + R}`} stroke="#1e1e1c" />
      {['N', 'E', 'S', 'W'].map((l, i) => {
        const a = (i * Math.PI) / 2;
        return (
          <text key={l} x={c + (R + 7) * Math.sin(a)} y={c - (R + 7) * Math.cos(a) + 3.5} textAnchor="middle" fill={l === 'N' ? '#ecebe5' : '#63625c'} style={{ font: '500 9px var(--mono)' }}>
            {l}
          </text>
        );
      })}
      {moon.sunAlt > -6 && <circle cx={sx} cy={sy} r="3.5" fill="none" stroke="#a09f98" strokeWidth="1" />}
      <line x1={c} y1={c} x2={mx} y2={my} stroke="#63625c" strokeDasharray={up ? undefined : '2 2'} />
      <circle cx={mx} cy={my} r="5" fill={up ? '#ecebe5' : '#000'} stroke="#ecebe5" />
    </svg>
  );
}

function shade(sunAlt: number): string {
  if (sunAlt > 0) return '#1b1b19';
  if (sunAlt > -6) return '#131312';
  if (sunAlt > -12) return '#0d0d0c';
  if (sunAlt > -18) return '#070707';
  return '#000';
}

function AltitudeChart({ place, center, nowMs }: { place: Place; center: number; nowMs: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useWidth(ref);
  const h = 132;
  const start = Math.floor((center - 3 * 3600000) / 600000) * 600000;
  const curve = useMemo(() => altitudeCurve(place, new Date(start), 24, 10), [place.lat, place.lon, place.elev, start]); // eslint-disable-line react-hooks/exhaustive-deps
  const [clouds, setClouds] = useState<CloudForecast | null>(null);
  useEffect(() => {
    let alive = true;
    fetchClouds(place.lat, place.lon).then((c) => alive && setClouds(c));
    return () => {
      alive = false;
    };
  }, [place.lat, place.lon]);
  const top = 16, bottom = 18, ch = h - top - bottom;
  const minA = -25, maxA = 90;
  const x = (tt: number) => ((tt - start) / 86400000) * w;
  const y = (a: number) => top + ch * (1 - (Math.max(minA, a) - minA) / (maxA - minA));
  const pts = curve.t.map((tt, i) => `${x(tt).toFixed(1)},${y(curve.moon[i]).toFixed(1)}`).join(' ');
  const area = `M${x(curve.t[0])},${y(0)} L${pts.split(' ').join(' L')} L${x(curve.t[curve.t.length - 1])},${y(0)} Z`;
  const ticks: number[] = [];
  for (let tt = Math.ceil(start / 3600000) * 3600000; tt < start + 86400000; tt += 3600000) if (new Date(tt).getHours() % 3 === 0) ticks.push(tt);
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} style={{ display: 'block' }}>
        <defs>
          <clipPath id="alt-above">
            <rect x="0" y="0" width={w} height={y(0)} />
          </clipPath>
        </defs>
        {curve.t.map((tt, i) => (i < curve.t.length - 1 ? <rect key={tt} x={x(tt)} y={top} width={x(curve.t[i + 1]) - x(tt) + 0.6} height={ch} fill={shade(curve.sun[i])} /> : null))}
        {clouds &&
          clouds.time.map((tt, i) => {
            if (tt < start - 3600000 || tt > start + 86400000) return null;
            const cc = clouds.total[i] ?? 0;
            return <rect key={tt} x={x(tt) + 0.5} y={2} width={Math.max(1, x(tt + 3600000) - x(tt) - 1)} height={7} fill="#ecebe5" opacity={0.06 + (cc / 100) * 0.55} />;
          })}
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="#454540" />
        {[30, 60].map((a) => (
          <g key={a}>
            <line x1={0} x2={w} y1={y(a)} y2={y(a)} stroke="#1e1e1c" />
            <text x={w - 2} y={y(a) - 3} textAnchor="end" fill="#63625c" style={{ font: '400 9.5px var(--mono)' }}>
              {a}°
            </text>
          </g>
        ))}
        <path d={area} fill="#ecebe5" opacity="0.07" clipPath="url(#alt-above)" />
        <polyline points={pts} fill="none" stroke="#454540" strokeWidth="1" strokeDasharray="2 3" />
        <polyline points={pts} fill="none" stroke="#ecebe5" strokeWidth="1.5" clipPath="url(#alt-above)" />
        {nowMs > start && nowMs < start + 86400000 && <line x1={x(nowMs)} x2={x(nowMs)} y1={top - 3} y2={h - bottom + 2} stroke="#ecebe5" />}
        {Math.abs(center - nowMs) > 60000 && <line x1={x(center)} x2={x(center)} y1={top - 3} y2={h - bottom + 2} stroke="#a09f98" strokeDasharray="3 2" />}
        {ticks.map((tt) => (
          <text key={tt} x={x(tt)} y={h - 4} textAnchor="middle" fill="#63625c" style={{ font: '400 10px var(--mono)' }}>
            {String(new Date(tt).getHours()).padStart(2, '0')}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function SkySection({ moon, place, rs, center, nowMs, cloudNow, approximate }: { moon: MoonInfo; place: Place; rs: RiseSet | null; center: number; nowMs: number; cloudNow: number | null; approximate: boolean }) {
  const t = useT();
  return (
    <Section title={t.sky.title} aside={moon.alt > 0 ? t.moon.aboveHorizon : t.moon.belowHorizon}>
      <div className="sky">
        <Dial moon={moon} />
        <dl className="kv">
          <dt>{t.sky.altitude}</dt>
          <dd>{n1(moon.alt)}°</dd>
          <dt>{t.sky.azimuth}</dt>
          <dd>
            {n0(moon.az)}° {compass16(moon.az)}
          </dd>
          <dt>{t.sky.rise}</dt>
          <dd>{rs?.rise ? fmtTime(rs.rise) : '—'}</dd>
          <dt>{t.sky.set}</dt>
          <dd>{rs?.set ? fmtTime(rs.set) : '—'}</dd>
          <dt>{t.sky.highest}</dt>
          <dd>{rs?.culmination ? `${fmtTime(rs.culmination.date)} · ${n0(rs.culmination.alt)}°` : '—'}</dd>
          {cloudNow !== null && (
            <>
              <dt>{t.sky.clouds}</dt>
              <dd>{n0(cloudNow)}%</dd>
            </>
          )}
        </dl>
      </div>
      <AltitudeChart place={place} center={center} nowMs={nowMs} />
      <div className="legend">
        <span>
          <i style={{ color: '#ecebe5' }} />
          {t.sky.legendMoon}
        </span>
        <span>
          <i style={{ borderTop: '4px solid rgba(236,235,229,0.4)' }} />
          {t.sky.legendClouds}
        </span>
        {approximate && <span>{t.approxPlace}</span>}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ phases / calendar
function jumpTo(d: Date) {
  useStore.getState().setTimeOffset(d.getTime() - Date.now());
  document.querySelector('.moon-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
}

export function PhasesSection({ from }: { from: Date }) {
  const t = useT();
  const key = Math.floor(from.getTime() / 3600000);
  const qs = useMemo(() => moonQuarters(from, 4), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section title={t.phasesTitle}>
      <div className="phases">
        {qs.map((q) => (
          <button key={q.date.getTime()} className="phase" onClick={() => jumpTo(q.date)}>
            <span className="phase__img">
              <MoonThumb date={q.date} size={46} />
            </span>
            <span className="phase__n">{t.phase[QUARTER_KEYS[q.quarter]]}</span>
            <span>
              <span className="phase__d" style={{ display: 'block' }}>
                {fmtDate(q.date, { day: 'numeric', month: 'short' })}
              </span>
              <span className="phase__r" style={{ display: 'block' }}>
                {fmtTime(q.date)} · {relDays(q.date, from)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}

export function CalendarSection({ selected, events }: { selected: Date; events: MoonEvent[] }) {
  const t = useT();
  const [off, setOff] = useState(0);
  const base = new Date(selected.getFullYear(), selected.getMonth() + off, 1);
  const lead = (base.getDay() + 6) % 7;
  const days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const today = new Date();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(base.getFullYear(), base.getMonth(), d, 22, 0, 0));
  while (cells.length % 7) cells.push(null);
  const marks = new Map<string, 'q' | 'e'>();
  for (const e of events) {
    const k = e.date.toDateString();
    if (e.type === 'eclipse') marks.set(k, 'e');
    else if (e.type === 'quarter' && !marks.has(k)) marks.set(k, 'q');
  }
  return (
    <Section
      title={<span style={{ textTransform: 'capitalize' }}>{fmtMonth(base)}</span>}
      aside={
        <span className="cal-nav">
          <button className="ibtn ibtn--sm ibtn--bare" onClick={() => setOff(off - 1)} aria-label="‹">
            <IChevronLeft />
          </button>
          <button className="ibtn ibtn--sm ibtn--bare" onClick={() => setOff(off + 1)} aria-label="›">
            <IChevronRight />
          </button>
        </span>
      }
    >
      <div className="cal">
        {t.dow.map((d) => (
          <div key={d} className="cal__dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} />;
          const isToday = d.toDateString() === today.toDateString();
          const isSel = d.toDateString() === selected.toDateString() && !isToday;
          const m = marks.get(d.toDateString());
          return (
            <button key={d.getTime()} className={`cal__d ${isToday ? 'is-today' : ''} ${isSel ? 'is-sel' : ''}`} onClick={() => jumpTo(d)}>
              {m && <span className={`cal__mark ${m === 'e' ? 'cal__mark--red' : ''}`} />}
              <MoonThumb date={d} size={28} />
              <span className="cal__n">{d.getDate()}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ eclipses
function EclipseDiagram({ e }: { e: EclipseInfo }) {
  const half = Math.max((e.penEnd.getTime() - e.peak.getTime()) / 60000, 60);
  const dg = useMemo(() => eclipseDiagram(e.peak, half * 1.15, 48), [e.peak.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const W = 320, H = 200;
  const k = (H / 2) / (dg.penumbraR + dg.moonR * 1.5);
  const cx = W / 2, cy = H / 2;
  const P = (p: { x: number; y: number }) => [cx - p.x * k, cy - p.y * k];
  const at = (tt: number) => {
    const tr = dg.track;
    let i = 0;
    while (i < tr.length - 2 && tr[i + 1].t < tt) i++;
    const a = tr[i], b = tr[i + 1];
    const u = Math.max(0, Math.min(1, (tt - a.t) / (b.t - a.t)));
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  const contacts: [Date | null, string][] = [
    [e.penStart, 'P1'],
    [e.parStart, 'U1'],
    [e.totStart, 'U2'],
    [e.totEnd, 'U3'],
    [e.parEnd, 'U4'],
    [e.penEnd, 'P4'],
  ];
  const [mx, my] = P(at(e.peak.getTime()));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={dg.penumbraR * k} fill="none" stroke="#454540" strokeDasharray="3 3" />
      <circle cx={cx} cy={cy} r={dg.umbraR * k} fill="#170604" stroke="#e5492e" strokeWidth="1" />
      <polyline points={dg.track.map((p) => P(p).join(',')).join(' ')} fill="none" stroke="#63625c" strokeDasharray="2 3" />
      {contacts.map(([d, l]) => {
        if (!d) return null;
        const [x, y] = P(at(d.getTime()));
        return (
          <g key={l}>
            <circle cx={x} cy={y} r={dg.moonR * k} fill="none" stroke="#2e2e2b" />
            <text x={x} y={y - dg.moonR * k - 4} textAnchor="middle" fill="#63625c" style={{ font: '400 9px var(--mono)' }}>
              {l}
            </text>
          </g>
        );
      })}
      <circle cx={mx} cy={my} r={dg.moonR * k} fill={e.kind === 'total' ? '#8f2a17' : e.kind === 'partial' ? '#4a4a45' : '#2a2a27'} stroke="#ecebe5" strokeWidth="1" />
      <text x={6} y={14} fill="#63625c" style={{ font: '400 9px var(--mono)' }}>
        N ↑ E ←
      </text>
    </svg>
  );
}

export function EclipseSection({ place, from, approximate }: { place: Place; from: Date; approximate: boolean }) {
  const t = useT();
  const key = Math.floor(from.getTime() / (86400000 * 3));
  const list = useMemo(() => lunarEclipses(from, 8, place), [key, place.lat, place.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const e = list[i];
  if (!e) return null;
  const total = e.kind === 'total';
  const nextBlood = list.findIndex((x) => x.kind === 'total' && x.visible);
  return (
    <Section
      title={t.eclipse.title}
      aside={
        <span className="cal-nav">
          <button className="ibtn ibtn--sm ibtn--bare" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="‹">
            <IChevronLeft />
          </button>
          <button className="ibtn ibtn--sm ibtn--bare" disabled={i >= list.length - 1} onClick={() => setI(i + 1)} aria-label="›">
            <IChevronRight />
          </button>
        </span>
      }
    >
      <div className="ecl__tags">
        {total && <span className="tag tag--red">{t.moon.bloodMoon}</span>}
        <span className="tag">{relDays(e.peak, from)}</span>
        {!approximate && <span className="tag">{e.visible ? t.eclipse.visible : t.eclipse.notVisible}</span>}
      </div>
      <div className="ecl__t">{t.eclipse[e.kind]}</div>
      <div className="ecl__d">{fmtDate(e.peak, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <div className="ecl__fig">
        <EclipseDiagram e={e} />
      </div>
      <dl className="kv">
        <dt>{t.eclipse.begins}</dt>
        <dd>
          {fmtTime(e.parStart ?? e.penStart)}
          <small>{e.parStart ? t.eclipse.partialPhase : t.eclipse.penumbra}</small>
        </dd>
        {total ? (
          <>
            <dt>{t.eclipse.totality}</dt>
            <dd>
              {fmtTime(e.totStart!)}
              <small>{t.eclipse.until(fmtTime(e.totEnd!))}</small>
            </dd>
          </>
        ) : (
          <>
            <dt>{t.eclipse.maximum}</dt>
            <dd>
              {fmtTime(e.peak)}
              <small>{e.kind === 'partial' ? t.eclipse.inShadow(pct(e.obscuration)) : t.eclipse.penumbraOnly}</small>
            </dd>
          </>
        )}
        <dt>{t.eclipse.ends}</dt>
        <dd>
          {fmtTime(e.parEnd ?? e.penEnd)}
          {e.altAtPeak !== null && !approximate && <small>{t.eclipse.altAtMax(n0(e.altAtPeak))}</small>}
        </dd>
      </dl>
      <div className="ecl__btns">
        <button className="btn btn--sm" onClick={() => jumpTo(e.peak)}>
          <IEclipse /> {t.eclipse.show}
        </button>
        {nextBlood >= 0 && nextBlood !== i && (
          <button className="btn btn--sm" onClick={() => setI(nextBlood)}>
            {t.eclipse.nextBlood(fmtDate(list[nextBlood].peak, { day: 'numeric', month: 'short', year: 'numeric' }))}
          </button>
        )}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ upcoming & ephemeris
export function UpcomingSection({ events, from }: { events: MoonEvent[]; from: Date }) {
  const t = useT();
  const list = events.filter((e) => e.date.getTime() > from.getTime() - 3600000 && e.type !== 'eclipse').slice(0, 8);
  const label = (e: MoonEvent) => {
    if (e.type === 'perigee') return { title: t.events.perigee, sub: t.events.closest(n0(e.distKm ?? 0)) };
    if (e.type === 'apogee') return { title: t.events.apogee, sub: t.events.farthest(n0(e.distKm ?? 0)) };
    const q = e.quarter ?? 0;
    if (e.badges.includes('super')) return { title: t.events.supermoon, sub: t.events.superSub };
    if (e.badges.includes('micro')) return { title: t.events.micromoon, sub: t.events.microSub };
    if (e.badges.includes('blue')) return { title: t.phase.full, sub: t.events.blueSub };
    return { title: t.phase[QUARTER_KEYS[q]], sub: [t.events.newSub, t.events.firstSub, t.events.fullSub, t.events.lastSub][q] };
  };
  return (
    <Section title={t.upcomingTitle}>
      {list.map((e) => {
        const l = label(e);
        return (
          <button key={e.id} className="ev" onClick={() => jumpTo(e.date)}>
            <span className="ev__i">{e.type === 'quarter' ? <MoonThumb date={e.date} size={30} /> : e.type === 'perigee' ? <IPerigee /> : <IApogee />}</span>
            <span style={{ minWidth: 0 }}>
              <span className="ev__t">
                {l.title}
                {e.badges.includes('blue') && <span className="tag">{t.events.blueMoon}</span>}
              </span>
              <span className="ev__s" style={{ display: 'block' }}>
                {l.sub}
              </span>
            </span>
            <span className="ev__d">
              {fmtDate(e.date, { day: 'numeric', month: 'short' })}
              <small>{relDays(e.date, from)}</small>
            </span>
          </button>
        );
      })}
    </Section>
  );
}

export function EphemerisSection({ moon }: { moon: MoonInfo }) {
  const t = useT();
  const rah = Math.floor(moon.ra);
  const ram = Math.round((moon.ra - rah) * 60);
  const cons = t.constellations[moon.constellation] ?? moon.constellation;
  return (
    <Section title={t.ephemerisTitle}>
      <div className="figures">
        <div className="figure">
          <div className="figure__k">{t.moon.distance}</div>
          <div className="figure__v">{n0(moon.distKm)} km</div>
          <div className="figure__s">{t.moon.fromCentre(n0(moon.geoDistKm))}</div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.moon.apparentSize}</div>
          <div className="figure__v">{arc(moon.diamDeg)}</div>
          <div className="figure__s">{moon.distKm < 365000 ? t.moon.large : moon.distKm > 400000 ? t.moon.small : t.moon.average}</div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.moon.illumination}</div>
          <div className="figure__v">{n1(moon.illum * 100)}%</div>
          <div className="figure__s">{t.moon.phaseAngle(n1(moon.phaseAngle))}</div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.moon.age}</div>
          <div className="figure__v">{t.moon.days(n1(moon.ageDays))}</div>
          <div className="figure__s">{moon.waxing ? t.moon.waxing : t.moon.waning}</div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.moon.elongation}</div>
          <div className="figure__v">{n1(moon.elongation)}°</div>
          <div className="figure__s">{t.moon.fromSun}</div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.moon.magnitude}</div>
          <div className="figure__v">{n2(moon.mag)}</div>
          <div className="figure__s">
            {t.moon.constellation}: {cons}
          </div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.moon.libration}</div>
          <div className="figure__v" style={{ fontSize: 16 }}>
            {moon.libLat >= 0 ? '+' : '−'}
            {n1(Math.abs(moon.libLat))}° {moon.libLon >= 0 ? '+' : '−'}
            {n1(Math.abs(moon.libLon))}°
          </div>
          <div className="figure__s">{t.moon.librationSub}</div>
        </div>
        <div className="figure">
          <div className="figure__k">{t.moon.coords}</div>
          <div className="figure__v" style={{ fontSize: 16 }}>
            {rah}h{String(ram).padStart(2, '0')}m {moon.dec >= 0 ? '+' : '−'}
            {n1(Math.abs(moon.dec))}°
          </div>
          <div className="figure__s">{t.moon.coordsSub}</div>
        </div>
      </div>
    </Section>
  );
}

export function useLiveNow() {
  return useNow(1000);
}
