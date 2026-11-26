export const IS_ELECTRON = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
export const HAS_GPS = !IS_ELECTRON && typeof navigator !== 'undefined' && 'geolocation' in navigator;
/** Default UI language baked into this build (VITE_DEFAULT_LANG=pl for the Polish .exe). */
export const BUILD_LANG: 'en' | 'pl' = import.meta.env.VITE_DEFAULT_LANG === 'pl' ? 'pl' : 'en';
export const APP_VERSION = '1.0.0';
