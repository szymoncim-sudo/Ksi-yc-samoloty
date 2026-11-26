/// <reference lib="webworker" />
import { predict, type Aircraft, type PredictOptions, type Site } from '../lib/transit';

interface Req {
  id: number;
  aircraft: Aircraft[];
  sites: Site[];
  opts: PredictOptions;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, aircraft, sites, opts } = e.data;
  try {
    const res = predict(aircraft, sites, opts);
    (self as unknown as Worker).postMessage({ id, res });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
