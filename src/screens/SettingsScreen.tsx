import { useState } from 'react';
import { n0, n1 } from '../lib/format';
import { APP_VERSION, IS_ELECTRON } from '../lib/platform';
import { useT } from '../i18n';
import { beep, chime, unlockAudio } from '../state/alerts';
import { refreshNow, startDemo } from '../state/feed';
import { DEFAULT_SETTINGS, useStore } from '../state/store';
import { Logo } from '../components/icons';
import { Opt, Range, Seg, Toggle } from '../components/ui';

const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const STANDALONE = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export default function SettingsScreen() {
  const t = useT();
  const s = useStore((x) => x.settings);
  const set = useStore((x) => x.setSettings);
  const feed = useStore((x) => x.feed);
  const [api, setApi] = useState(s.apiBase);

  return (
    <div className="scroll">
      <div className="set">
        <h1 className="h1">{t.settings.title}</h1>
        <p className="lead">{t.settings.sub}</p>

        <div className="set__group">
          <div className="set__gt">{t.settings.language}</div>
          <Opt label={t.settings.language} sub="English · Polski">
            <Seg
              value={s.lang}
              onChange={(v) => set({ lang: v })}
              options={[
                { value: 'en', label: 'English' },
                { value: 'pl', label: 'Polski' },
              ]}
            />
          </Opt>
        </div>

        {!IS_ELECTRON && !STANDALONE && (
          <div className="set__group">
            <div className="set__gt">{t.settings.install}</div>
            <ol className="steps">
              {(IS_IOS ? t.settings.installIos : t.settings.installOther).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="set__group">
          <div className="set__gt">{t.settings.forecast}</div>
          <Opt label={t.settings.horizon} sub={t.settings.horizonSub}>
            <Seg
              value={s.horizonMin}
              onChange={(v) => set({ horizonMin: v })}
              options={[
                { value: 5, label: '5 min' },
                { value: 10, label: '10 min' },
                { value: 15, label: '15 min' },
              ]}
            />
          </Opt>
          <Opt label={t.settings.refresh} sub={t.settings.refreshSub}>
            <Seg
              value={s.refreshSec}
              onChange={(v) => set({ refreshSec: v })}
              options={[
                { value: 6, label: '6 s' },
                { value: 10, label: '10 s' },
                { value: 20, label: '20 s' },
              ]}
            />
          </Opt>
          <Opt stack label={t.settings.minAlt} sub={t.settings.minAltSub(n0(s.minMoonAlt))}>
            <Range min={0} max={30} step={1} value={s.minMoonAlt} onChange={(v) => set({ minMoonAlt: v })} label={t.settings.minAlt} />
          </Opt>
          <Opt stack label={t.settings.near} sub={t.settings.nearSub(n1(s.nearDeg))}>
            <Range min={0.2} max={5} step={0.1} value={s.nearDeg} onChange={(v) => set({ nearDeg: v })} label={t.settings.near} />
          </Opt>
        </div>

        <div className="set__group">
          <div className="set__gt">{t.settings.alerts}</div>
          <Opt label={t.settings.sound} sub={t.settings.soundSub}>
            <Toggle
              on={s.sound}
              onChange={(v) => {
                unlockAudio();
                set({ sound: v });
                if (v) chime();
              }}
              label={t.settings.sound}
            />
          </Opt>
          <Opt label={t.settings.beeps} sub={t.settings.beepsSub}>
            <Toggle
              on={s.beeps}
              onChange={(v) => {
                unlockAudio();
                set({ beeps: v });
                if (v) beep(false);
              }}
              label={t.settings.beeps}
            />
          </Opt>
          <Opt label={t.settings.lead} sub={t.settings.leadSub}>
            <Seg
              value={s.alertLeadSec}
              onChange={(v) => set({ alertLeadSec: v })}
              options={[
                { value: 30, label: '30 s' },
                { value: 60, label: '1 min' },
                { value: 120, label: '2 min' },
              ]}
            />
          </Opt>
          <Opt label={t.settings.awake} sub={t.settings.awakeSub}>
            <Toggle on={s.keepAwake} onChange={(v) => set({ keepAwake: v })} label={t.settings.awake} />
          </Opt>
          <Opt label={t.settings.simulate} sub={t.settings.simulateSub}>
            <button
              className="btn btn--sm"
              onClick={() => {
                unlockAudio();
                if (startDemo()) useStore.getState().setTab('radar');
                else alert(t.settings.simulateFail);
              }}
            >
              {t.settings.run}
            </button>
          </Opt>
        </div>

        <div className="set__group">
          <div className="set__gt">{t.settings.display}</div>
          <Opt label={t.settings.orientation} sub={t.settings.orientationSub}>
            <Seg
              value={s.moonOrientation}
              onChange={(v) => set({ moonOrientation: v })}
              options={[
                { value: 'horizon', label: t.settings.sky },
                { value: 'north', label: t.settings.north },
              ]}
            />
          </Opt>
          <Opt label={t.settings.atmosphere} sub={t.settings.atmosphereSub}>
            <Toggle on={s.atmosphere} onChange={(v) => set({ atmosphere: v })} label={t.settings.atmosphere} />
          </Opt>
          <Opt label={t.settings.earthshine} sub={t.settings.earthshineSub}>
            <Toggle on={s.earthshine} onChange={(v) => set({ earthshine: v })} label={t.settings.earthshine} />
          </Opt>
          <Opt label={t.settings.night} sub={t.settings.nightSub}>
            <Toggle on={s.nightRed} onChange={(v) => set({ nightRed: v })} label={t.settings.night} />
          </Opt>
          <Opt label={t.settings.quality} sub={t.settings.qualitySub}>
            <Seg
              value={s.quality}
              onChange={(v) => set({ quality: v })}
              options={[
                { value: 'high', label: t.settings.high },
                { value: 'balanced', label: t.settings.eco },
              ]}
            />
          </Opt>
          <Opt label={t.settings.units} sub={t.settings.unitsSub}>
            <Seg
              value={s.units}
              onChange={(v) => set({ units: v })}
              options={[
                { value: 'metric', label: 'm · km/h' },
                { value: 'aviation', label: 'ft · kt' },
              ]}
            />
          </Opt>
        </div>

        <div className="set__group">
          <div className="set__gt">{t.settings.data}</div>
          <Opt
            stack
            label={t.settings.source}
            sub={`${feed.source ? t.settings.sourceNow(feed.source.replace('adsbfi', 'adsb.fi').replace('adsblol', 'adsb.lol')) + ' · ' : ''}${t.settings.sourceSub}`}
          >
            <Seg
              block
              value={s.source}
              onChange={(v) => {
                set({ source: v });
                refreshNow();
              }}
              options={[
                { value: 'auto', label: t.settings.auto },
                { value: 'both', label: t.settings.both },
                { value: 'adsbfi', label: 'adsb.fi' },
                { value: 'adsblol', label: 'adsb.lol' },
              ]}
            />
          </Opt>
          <Opt stack label={t.settings.proxy} sub={t.settings.proxySub}>
            <div className="inline" style={{ flexWrap: 'nowrap' }}>
              <input className="field" value={api} placeholder="https://lunaris.example.workers.dev" onChange={(e) => setApi(e.target.value)} />
              <button
                className="btn"
                onClick={() => {
                  set({ apiBase: api.trim() });
                  refreshNow();
                }}
              >
                OK
              </button>
            </div>
          </Opt>
          {feed.clockSkew !== undefined && Math.abs(feed.clockSkew) > 4 && (
            <Opt label={t.settings.clock} sub={t.settings.clockSub}>
              <span className="mono fg2">{n1(feed.clockSkew)} s</span>
            </Opt>
          )}
        </div>

        <div className="set__group">
          <div className="set__gt">{t.settings.how}</div>
          <div className="prose">{t.settings.howText}</div>
        </div>

        <div style={{ marginTop: 24 }}>
          <button className="btn btn--sm" onClick={() => set({ ...DEFAULT_SETTINGS, lang: s.lang, apiBase: s.apiBase })}>
            {t.settings.reset}
          </button>
        </div>

        <div className="colophon">
          <div className="brand" style={{ marginBottom: 10 }}>
            <Logo /> LUNARIS
          </div>
          <div className="mono">{t.settings.version(APP_VERSION)}</div>
          <div style={{ marginTop: 8 }}>{t.settings.credits}</div>
        </div>
      </div>
    </div>
  );
}
