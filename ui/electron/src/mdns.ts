/**
 * mDNS advertise -- make the embedded server discoverable on the local
 * network. iOS app with @capacitor-community/bonjour (or a custom plugin)
 * sees the service and connects automatically.
 *
 * Uses `bonjour-service`, a pure-JS mDNS impl, so no native build steps.
 * Advertised as `_heron._tcp.local` with the running port. TXT
 * record carries the app version so phones can decide if they're
 * compatible.
 */
import { app } from 'electron';
import { BRAND } from './brand';

type AdvertiseOptions = {
  name: string;
  port: number;
};

let advertiser: any = null;

export async function startMdnsAdvertise(opts: AdvertiseOptions): Promise<void> {
  try {
    // Lazy-load so a missing dep doesn't break the whole main process.
    // bonjour-service is added to the electron/package.json deps.
    // Use dynamic import (not require) so vi.mock can intercept the
    // module in tests -- CJS `require()` bypasses Vitest's mock layer.
    const mod = (await import('bonjour-service')) as unknown as {
      Bonjour?: new () => { publish: (opts: unknown) => unknown };
      default?: { Bonjour?: new () => { publish: (opts: unknown) => unknown } };
    };
    // CJS dynamic import can land on either `mod.Bonjour` (vitest mock
    // factory shape) or `mod.default.Bonjour` (Node's CJS interop).
    const Bonjour = mod.Bonjour ?? mod.default?.Bonjour;
    if (!Bonjour) throw new Error('Bonjour constructor missing from bonjour-service');
    const instance = new Bonjour();
    advertiser = instance.publish({
      name: opts.name,
      type: BRAND.mdnsType,
      protocol: 'tcp',
      port: opts.port,
      txt: {
        version: app.getVersion(),
        platform: process.platform,
      },
    });
    console.log(`[mdns] advertising ${BRAND.name} on port ${opts.port}`);
  } catch (e) {
    console.warn('[mdns] failed to advertise — bonjour-service may be missing', e);
  }
}

export function stopMdnsAdvertise(): void {
  if (advertiser) {
    try {
      advertiser.stop();
    } catch {}
    advertiser = null;
  }
}
