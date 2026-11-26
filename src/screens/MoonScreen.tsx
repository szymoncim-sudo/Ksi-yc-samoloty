import { useEffect, useMemo, useState } from 'react';
import { lunarEclipses, moonInfo, moonRiseSet, upcomingEvents } from '../lib/astro';
import { arc, fmtTime, n0, n1 } from '../lib/format';
import { fetchClouds } from '../lib/services';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { IChevronDown, Logo } from '../components/icons';
import {
  CalendarSection,
  EclipseSection,
  EphemerisSection,
  Explorer,
  HeroHint,
  MoonCanvas,
  NextTransit,
  PhasesSection,
  SkySection,
  TimeRuler,
  UpcomingSection,
} from '../components/moon';
import { SitePicker, useActivePlace } from '../components/SitePicker';
import { useMedia, useNow } from '../components/ui';
import type { MoonParams } from '../moon/MoonEngine';

export function MoonScreen() {
  const t = useT();
  const now = useNow(1000);
  const liveMinute = Math.floor(now / 30000) * 30000;
  const offset = useStore((s) => s.timeOffsetMs);
  const settings = useStore((s) => s.settings);
  const live = Math.abs(offset) < 60000;
  const date = useMemo(() => new Date(live ? liveMinute : liveMinute + offset), [liveMinute, offset, live]);
  const { place, label, approximate } = useActivePlace();
  const desktop = useMedia('(min-width: 1024px)');
  const [picker, setPicker] = useState(false);
  const [explore, setExplore] = useState(false);

  const moon = useMemo(() => moonInfo(date, place), [date, place]);
  const dayStart = useMemo(() => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [date]);
  const rs = useMemo(() => moonRiseSet(place, new Date(dayStart)), [dayStart, place]);
  const evKey = Math.floor(date.getTime() / (6 * 3600000));
  const events = useMemo(() => upcomingEvents(new Date(evKey * 6 * 3600000 - 40 * 86400000), approximate ? null : place, 14), [evKey, place, approximate]);

  const [cloudNow, setCloudNow] = useState<number | null>(null);
  const hourKey = Math.floor(date.getTime() / 3600000);
  useEffect(() => {
    if (approximate || !live) {
      setCloudNow(null);
      return;
    }
    let alive = true;
    fetchClouds(place.lat, place.lon).then((c) => {
      if (!alive || !c) return;
      let best = 0;
      c.time.forEach((tt, i) => {
        if (Math.abs(tt - date.getTime()) < Math.abs(c.time[best] - date.getTime())) best = i;
      });
      setCloudNow(Math.abs(c.time[best] - date.getTime()) < 2 * 3600000 ? c.total[best] : null);
    });
    return () => {
      alive = false;
    };
  }, [place.lat, place.lon, hourKey, approximate, live]); // eslint-disable-line react-hooks/exhaustive-deps

  // lunar eclipse in progress at the displayed time
  const nearFull = moon.phaseLon > 165 && moon.phaseLon < 195;
  const ecKey = Math.floor(date.getTime() / 43200000);
  const eclipse = useMemo(() => {
    if (!nearFull) return null;
    const e = lunarEclipses(new Date(date.getTime() - 86400000), 1, null)[0];
    return e && date >= e.penStart && date <= e.penEnd ? e : null;
  }, [ecKey, nearFull]); // eslint-disable-line react-hooks/exhaustive-deps
  let title = t.phase[moon.phaseKey];
  let note: { text: string; cls: string } | null = null;
  if (eclipse) {
    if (eclipse.totStart && date >= eclipse.totStart && date <= eclipse.totEnd!) {
      title = t.moon.bloodMoon;
      note = { text: t.moon.totalityUntil(fmtTime(eclipse.totEnd!)), cls: 'headline__note--red' };
    } else if (eclipse.parStart && date >= eclipse.parStart && date <= eclipse.parEnd!) {
      title = t.moon.eclipsePartial;
      note = { text: t.moon.partialNow(fmtTime(eclipse.peak)), cls: 'headline__note--red' };
    } else {
      title = t.moon.eclipsePenumbral;
      note = { text: t.moon.penumbralNow(fmtTime(eclipse.peak)), cls: '' };
    }
  } else if (moon.alt > -0.5 && moon.alt < 12 && !approximate) {
    note = { text: moon.alt < 4 ? t.moon.lowRed : t.moon.lowOrange, cls: 'headline__note--warm' };
  }

  const params: MoonParams = {
    date,
    place: approximate ? null : place,
    orientation: settings.moonOrientation,
    atmosphere: settings.atmosphere,
    earthshine: settings.earthshine,
    labels: false,
    labelLang: settings.lang,
  };

  const hero = (
    <div className="hero">
      <MoonCanvas params={params} fill={desktop ? 0.7 : 0.74} offsetY={desktop ? 0 : 0.035} onTap={() => setExplore(true)} />
      <div className="topbar">
        <span className="brand">
          <Logo /> LUNARIS
        </span>
        <button className="site-btn" onClick={() => setPicker(true)}>
          <span>{label}</span>
          <IChevronDown />
        </button>
      </div>
      <HeroHint />
    </div>
  );

  const content = (
    <div className="moon-page">
      {!desktop && hero}
      <div className="headline">
        <div className="headline__phase">{title}</div>
        <div className="headline__big">
          <span className="headline__num">{n1(moon.illum * 100)}%</span>
          <span className="headline__unit">{t.moon.illuminated}</span>
        </div>
        <div className="headline__meta">
          <span>
            {t.moon.age} {t.moon.days(n1(moon.ageDays))}
          </span>
          <span>{n0(moon.distKm)} km</span>
          <span>⌀ {arc(moon.diamDeg)}</span>
        </div>
        {!live && <div className="headline__note">{t.moon.simulated}</div>}
        {note && <div className={`headline__note ${note.cls}`}>{note.text}</div>}
      </div>
      <TimeRuler liveNow={liveMinute} />
      {live && <NextTransit now={now} />}
      <SkySection moon={moon} place={place} rs={rs} center={date.getTime()} nowMs={now} cloudNow={cloudNow} approximate={approximate} />
      <PhasesSection from={date} />
      <EclipseSection place={place} from={date} approximate={approximate} />
      <CalendarSection selected={date} events={events} />
      <UpcomingSection events={events} from={date} />
      <EphemerisSection moon={moon} />
    </div>
  );

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {desktop ? (
        <div className="moon-desk">
          {hero}
          <div className="scroll moon-scroll">{content}</div>
        </div>
      ) : (
        <div className="scroll moon-scroll">{content}</div>
      )}
      {explore && <Explorer base={params} onClose={() => setExplore(false)} />}
      <SitePicker open={picker} onClose={() => setPicker(false)} />
    </div>
  );
}
