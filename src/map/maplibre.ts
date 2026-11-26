// MapLibre v6 spawns a self-contained module worker. Point it at an emitted asset so it works
// with Vite's dependency pre-bundling, in production builds and under Electron's app:// scheme.
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href);

export default maplibregl;
export * from 'maplibre-gl';
