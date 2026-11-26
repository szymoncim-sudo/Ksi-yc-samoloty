// Lunaris desktop (Windows .exe) – Electron main process.
// Serves the built app from a privileged app:// scheme and implements /api/flights natively
// (no CORS limits), so the renderer code is identical to the web/PWA build.
import { app, BrowserWindow, Menu, net, protocol, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CORS_HEADERS, handleFlights } from '../shared/flight-proxy.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SMOKE = process.argv.includes('--smoke');
const SHOOT = process.argv.find((a) => a.startsWith('--shoot='))?.slice(8);
if (SHOOT) {
  // keep rendering although the capture window sits off-screen
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

if (!SMOKE && !SHOOT && !app.requestSingleInstanceLock()) app.quit();

function serve() {
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    if (url.pathname === '/api/flights') {
      try {
        const { status, body } = await handleFlights(url.searchParams, (u, init) => net.fetch(u, init));
        return new Response(body, { status, headers: CORS_HEADERS });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 502, headers: CORS_HEADERS });
      }
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(DIST, p));
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 380,
    minHeight: 640,
    show: false,
    backgroundColor: '#000000',
    title: 'Lunaris',
    icon: path.join(DIST, 'icons', 'icon-512.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000000', symbolColor: '#a09f98', height: 32 },
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.loadURL('app://lunaris/index.html');

  if (SMOKE) {
    // automated check: render, wait for textures/map, capture a screenshot, quit
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        const out = process.env.LUNARIS_SMOKE_OUT || path.join(app.getPath('temp'), 'lunaris-smoke.png');
        fs.writeFileSync(out, img.toPNG());
        const info = await win.webContents.executeJavaScript(
          `fetch('/api/flights?lat=52.21&lon=21.00&dist=60').then(r=>r.json()).then(j=>({ok:j.ok,source:j.source,n:(j.ac||[]).length})).catch(e=>({err:String(e)}))`,
        );
        console.log('SMOKE', out, JSON.stringify(info));
        app.quit();
      }, 9000);
    });
  }
  return win;
}

app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) {
    if (w.isMinimized()) w.restore();
    w.focus();
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  serve();
  if (SHOOT) {
    console.log('shoot mode ->', path.resolve(SHOOT));
    try {
      const { runShots } = await import('./shoot.mjs');
      await runShots(path.resolve(SHOOT));
    } catch (e) {
      console.error('shoot failed', e);
    }
    app.quit();
    return;
  }
  createWindow();
});

app.on('window-all-closed', () => app.quit());
