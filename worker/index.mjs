// Cloudflare Worker: serves the built PWA (static assets) and the /api/flights proxy.
// Deploy: npx wrangler login  →  npm run deploy
import { CORS_HEADERS, handleFlights, parseParams } from '../shared/flight-proxy.mjs';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/flights') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
      // 3-second micro cache per rounded query – protects the free upstream APIs
      const p = parseParams(url.searchParams);
      const cacheKey = new Request(`https://cache.lunaris/flights/${p.lat}/${p.lon}/${p.dist}/${p.src}`);
      const cache = caches.default;
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
      // adsb.fi answers 403 to Cloudflare egress, so the Worker starts with adsb.lol, then OpenSky
      const { status, body } = await handleFlights(url.searchParams, fetch, ['adsblol', 'opensky', 'adsbfi']);
      const res = new Response(body, { status, headers: CORS_HEADERS });
      if (status === 200) {
        const toCache = new Response(body, { status, headers: { ...CORS_HEADERS, 'cache-control': 'public, max-age=3' } });
        ctx.waitUntil(cache.put(cacheKey, toCache));
      }
      return res;
    }
    return env.ASSETS.fetch(request);
  },
};
