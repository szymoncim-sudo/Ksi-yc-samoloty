import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startDemo } from './state/feed';
import { useStore } from './state/store';
import './styles/app.css';

// hook for automated screenshots / testing (`?automation` in the URL)
if (import.meta.env.DEV || location.search.includes('automation')) {
  (window as unknown as Record<string, unknown>).__lunaris = { useStore, startDemo };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA service worker (web only – not in Electron)
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/Electron/i.test(navigator.userAgent)) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => undefined);
}
