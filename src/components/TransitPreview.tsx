// Eyepiece simulation: the Moon at the transit instant as seen from the site (zenith up),
// with the aircraft planform crossing it to scale along the predicted chord.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PLANFORM_PATHS, typeInfo } from '../lib/aircraft';
import { moonInfo } from '../lib/astro';
import { n1 } from '../lib/format';
import type { Aircraft, Pass, Site } from '../lib/transit';
import { getMoonEngine } from '../moon/MoonEngine';
import { useT } from '../i18n';
import { IPause, IPlay } from './icons';
import { Seg } from './ui';

export function TransitPreview({ p, ac, site }: { p: Pass; ac?: Aircraft; site?: Site }) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [speed, setSpeed] = useState(0.25);
  const [fov, setFov] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [moonImg, setMoonImg] = useState<HTMLCanvasElement | null>(null);
  const ti = typeInfo(ac?.type, ac?.category);
  const place = useMemo(() => (site ? { lat: site.lat, lon: site.lon, elev: site.elevMsl } : null), [site?.lat, site?.lon, site?.elevMsl]); // eslint-disable-line react-hooks/exhaustive-deps
  const sunAlt = useMemo(() => (place ? moonInfo(new Date(p.t * 1000), place).sunAlt : -30), [p.t, place]);

  useEffect(() => {
    const eng = getMoonEngine();
    let alive = true;
    const make = () => {
      const c = eng.snapshot({ date: new Date(p.t * 1000), place, orientation: 'horizon', atmosphere: false, earthshine: true, labels: false }, 560);
      if (alive && c) setMoonImg(c);
    };
    if (eng.ready) make();
    const off = eng.on((e) => {
      if (e.ready) make();
    });
    return () => {
      alive = false;
      off();
    };
  }, [p.key, Math.round(p.t / 30), place]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let raf = 0;
    const plane = new Path2D(PLANFORM_PATHS[ti.form]);
    const t0 = performance.now();
    const span = p.path[p.path.length - 1].dt - p.path[0].dt;
    const draw = (now: number) => {
      const w = c.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(w * dpr);
      }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = w / 2, cy = w / 2;
      const moonPx = w * 0.27 * fov;
      const k = moonPx / p.moonRadiusDeg;
      const day = sunAlt > -2;
      ctx.fillStyle = day ? '#0d1a29' : '#000';
      ctx.fillRect(0, 0, w, w);
      if (moonImg) {
        ctx.save();
        if (day) ctx.globalAlpha = 0.78;
        ctx.drawImage(moonImg, cx - moonPx * 1.01, cy - moonPx * 1.01, moonPx * 2.02, moonPx * 2.02);
        ctx.restore();
      } else {
        ctx.fillStyle = '#9a978d';
        ctx.beginPath();
        ctx.arc(cx, cy, moonPx, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(236,235,229,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 0.5, 0);
      ctx.lineTo(cx + 0.5, w);
      ctx.moveTo(0, cy + 0.5);
      ctx.lineTo(w, cy + 0.5);
      ctx.stroke();
      const sigDeg = (p.sigmaM / p.rangeM) * (180 / Math.PI);
      ctx.lineCap = 'butt';
      ctx.beginPath();
      p.path.forEach((q, i) => (i ? ctx.lineTo(cx + q.x * k, cy - q.y * k) : ctx.moveTo(cx + q.x * k, cy - q.y * k)));
      ctx.strokeStyle = 'rgba(255,106,31,0.09)';
      ctx.lineWidth = Math.min(w, Math.max(2, 2 * sigDeg * k));
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,106,31,0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      const tt = playing ? (((now - t0) / 1000) * speed) % (span + 0.6) : span / 2;
      const dt = p.path[0].dt + Math.min(span, tt);
      let i = 0;
      while (i < p.path.length - 2 && p.path[i + 1].dt < dt) i++;
      const a = p.path[i], b = p.path[i + 1];
      const u = Math.max(0, Math.min(1, (dt - a.dt) / (b.dt - a.dt)));
      const px = cx + (a.x + (b.x - a.x) * u) * k;
      const py = cy - (a.y + (b.y - a.y) * u) * k;
      const sz = Math.max(7, (p.angularSpanArcmin / 60) * k);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((p.pathAngle * Math.PI) / 180);
      ctx.scale(sz / 100, sz / 100);
      ctx.translate(-50, -50);
      ctx.fillStyle = '#000';
      ctx.fill(plane);
      ctx.restore();
      ctx.font = '400 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(236,235,229,0.5)';
      ctx.textAlign = 'left';
      ctx.fillText(`${t.detail.zenith} ↑`, 10, 18);
      const ten = (10 / 60) * k;
      ctx.fillRect(10, w - 16, ten, 1);
      ctx.fillText('10′', 10, w - 21);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ff8f57';
      ctx.fillText(`${dt >= 0 ? '+' : '−'}${n1(Math.abs(dt))} s`, w - 10, 18);
      if (playing) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [p, moonImg, speed, fov, playing, ti.form, sunAlt, t]);

  return (
    <>
      <div className="eyepiece">
        <canvas ref={canvas} />
      </div>
      <div className="eyepiece__ctl">
        <button className={`ibtn ibtn--sm ${playing ? 'is-on' : ''}`} onClick={() => setPlaying(!playing)} aria-label="Play">
          {playing ? <IPause /> : <IPlay />}
        </button>
        <Seg
          value={speed}
          onChange={setSpeed}
          options={[
            { value: 1, label: '1×' },
            { value: 0.25, label: '¼×' },
            { value: 0.1, label: '⅒×' },
          ]}
        />
        <Seg
          value={fov}
          onChange={setFov}
          options={[
            { value: 0.55, label: '−' },
            { value: 1, label: '1:1' },
            { value: 1.8, label: '+' },
          ]}
        />
      </div>
    </>
  );
}
