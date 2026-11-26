// Automated screenshots for the README (run: electron . --shoot=docs/screens).
// Renders off-screen with phone (390×844 @3x) and desktop layouts and walks through the app.
import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SITE = {
  id: 'site1',
  name: 'Pole Mokotowskie, Warsaw',
  lat: 52.2128,
  lon: 20.9962,
  ground: 112,
  groundManual: false,
  agl: 1.7,
  reachKm: 1,
  enabled: true,
};

function seed(lang) {
  return JSON.stringify({
    state: {
      settings: {
        lang,
        horizonMin: 10,
        refreshSec: 10,
        minMoonAlt: 4,
        nearDeg: 1.5,
        source: 'auto',
        apiBase: '',
        sound: false,
        beeps: false,
        alertLeadSec: 60,
        keepAwake: false,
        units: 'metric',
        moonOrientation: 'horizon',
        atmosphere: true,
        earthshine: true,
        labels: false,
        quality: 'high',
        nightRed: false,
        useGps: false,
        showAmbient: true,
      },
      sites: [SITE],
      activeSiteId: SITE.id,
      onboarded: true,
      buildLang: lang,
    },
    version: 0,
  });
}

async function session({ dir, w, h, dpr, mobile, lang, steps }) {
  const win = new BrowserWindow({
    width: w,
    height: h,
    useContentSize: true,
    show: false,
    backgroundColor: '#000000',
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false },
  });
  const url = 'app://lunaris/index.html?automation';
  const loadOnce = () =>
    new Promise((resolve) => {
      win.webContents.once('did-finish-load', () => resolve(true));
      win.loadURL(url).catch(() => resolve(false));
      setTimeout(() => resolve(false), 20000);
    });
  const load = async () => {
    for (let i = 0; i < 4; i++) {
      if (await loadOnce()) return true;
      await wait(1500);
    }
    return false;
  };
  console.log('load1', w, h, await load());
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  if (mobile) await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await win.webContents.executeJavaScript(`localStorage.setItem('lunaris-v1', ${JSON.stringify(seed(lang))}); true`);
  console.log('load2', await load());
  await wait(9000);
  const js = (code) => win.webContents.executeJavaScript(code);
  const cap = async (name) => {
    const { data } = await dbg.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(dir, name), Buffer.from(data, 'base64'));
    console.log('shot', name);
  };
  for (const s of steps) {
    if (s.js) console.log('js', String(await js(s.js)).slice(0, 40));
    if (s.wait) await wait(s.wait);
    if (s.shot) await cap(s.shot);
  }
  dbg.detach();
  win.destroy();
}

const L = 'window.__lunaris.useStore.getState()';
const selectDemo = `(() => { const p = (${L}.prediction?.passes || []).find((x) => x.hex === 'demo01'); if (p) ${L}.selectPass(p.key); return !!p; })()`;
const clickText = (t) => `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(t)}); b?.click(); return !!b; })()`;
const tapHero = `(() => { const c = document.querySelector('.hero__gl canvas'); if (!c) return false; const r = c.getBoundingClientRect(); const o = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, bubbles: true }; c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new PointerEvent('pointerup', o)); return true; })()`;

export async function runShots(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const blood = Date.parse('2029-12-20T22:41:54Z');
  if (!only || only === 'phone') await session({
    dir,
    w: 390,
    h: 844,
    dpr: 3,
    mobile: true,
    lang: 'en',
    steps: [
      { shot: 'phone-moon.png' },
      { js: `document.querySelector('.moon-scroll').scrollTo(0, document.querySelector('.ruler').offsetTop - 40)`, wait: 1200, shot: 'phone-tonight.png' },
      { js: `document.querySelector('.moon-scroll').scrollTo(0, 0); ${L}.setTimeOffset(${blood} - Date.now())`, wait: 3500, shot: 'phone-blood-moon.png' },
      { js: `${L}.setTimeOffset(0)`, wait: 2500 },
      { js: tapHero, wait: 2500, shot: 'phone-explorer.png' },
      { js: `document.querySelector('.explorer .explorer__bar .ibtn')?.click()`, wait: 800 },
      { js: `${L}.setTab('radar')`, wait: 7000 },
      { js: `window.__lunaris.startDemo(95)`, wait: 1500 },
      { js: selectDemo, wait: 3000, shot: 'phone-transit.png' },
      { js: clickText('Show on map'), wait: 3000, shot: 'phone-map.png' },
      { js: `${L}.selectPass(null); ${L}.setTab('places')`, wait: 3500, shot: 'phone-sites.png' },
      { js: `${L}.setTab('settings')`, wait: 1500, shot: 'phone-settings.png' },
    ],
  });
  if (!only || only === 'desktop') await session({
    dir,
    w: 1440,
    h: 900,
    dpr: 1,
    mobile: false,
    lang: 'en',
    steps: [
      { shot: 'desktop-moon.png' },
      { js: `${L}.setTab('radar')`, wait: 7000 },
      { js: `window.__lunaris.startDemo(95)`, wait: 1500 },
      { js: selectDemo, wait: 3000, shot: 'desktop-transit.png' },
    ],
  });
}
