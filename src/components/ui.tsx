import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IMinus, IPlus } from './icons';

export function Section(props: { title?: ReactNode; aside?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={`sec ${props.className ?? ''}`}>
      {(props.title || props.aside) && (
        <div className="sec__h">
          <div className="sec__t">{props.title}</div>
          {props.aside && <div className="sec__a">{props.aside}</div>}
        </div>
      )}
      {props.children}
    </section>
  );
}

export function Seg<T extends string | number>(props: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  block?: boolean;
}) {
  return (
    <div className={`seg ${props.block ? 'seg--block' : ''}`} role="radiogroup">
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === props.value}
          className={o.value === props.value ? 'is-on' : ''}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle(props: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button className={`tog ${props.on ? 'is-on' : ''}`} role="switch" aria-checked={props.on} aria-label={props.label} onClick={() => props.onChange(!props.on)} />;
}

export function Range(props: { min: number; max: number; step: number; value: number; onChange: (v: number) => void; label?: string }) {
  const p = ((props.value - props.min) / (props.max - props.min)) * 100;
  return (
    <input
      type="range"
      className="range"
      aria-label={props.label}
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.value}
      style={{ ['--p' as string]: `${p}%` }}
      onChange={(e) => props.onChange(parseFloat(e.target.value))}
    />
  );
}

export function Stepper(props: { value: number; step: number; min: number; max: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const set = (v: number) => props.onChange(Math.max(props.min, Math.min(props.max, Math.round(v * 100) / 100)));
  return (
    <div className="stepper">
      <button onClick={() => set(props.value - props.step)} aria-label="−">
        <IMinus />
      </button>
      <span>{props.format ? props.format(props.value) : props.value}</span>
      <button onClick={() => set(props.value + props.step)} aria-label="+">
        <IPlus />
      </button>
    </div>
  );
}

export function Opt(props: { label: ReactNode; sub?: ReactNode; children?: ReactNode; stack?: boolean }) {
  return (
    <div className={`opt ${props.stack ? 'opt--stack' : ''}`}>
      <div className="opt__m">
        <div className="opt__l">{props.label}</div>
        {props.sub && <div className="opt__s">{props.sub}</div>}
      </div>
      {props.children}
    </div>
  );
}

export function Sheet(props: { open: boolean; onClose: () => void; children: ReactNode }) {
  const drag = useRef<{ y0: number; dy: number } | null>(null);
  const [dy, setDy] = useState(0);
  useEffect(() => {
    if (!props.open) setDy(0);
  }, [props.open]);
  return (
    <>
      <div className={`sheet-bg ${props.open ? 'is-on' : ''}`} onClick={props.onClose} />
      <div
        className={`sheet ${props.open ? 'is-on' : ''}`}
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}
        aria-hidden={!props.open}
      >
        <div
          className="sheet__grab"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { y0: e.clientY, dy: 0 };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            drag.current.dy = Math.max(0, e.clientY - drag.current.y0);
            setDy(drag.current.dy);
          }}
          onPointerUp={() => {
            const d = drag.current?.dy ?? 0;
            drag.current = null;
            setDy(0);
            if (d > 100) props.onClose();
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDy(0);
          }}
        />
        <div className="sheet__body">{props.children}</div>
      </div>
    </>
  );
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}
