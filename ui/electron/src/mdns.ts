/**
 * mDNS advertise — make the embedded server discoverable on the local
 * network. iOS app with @capacitor-community/bonjour (or a custom plugin)
 * sees the service and connects automatically.
 *
 * Uses `bonjour-service`, a pure-JS mDNS impl, so no native build steps.
 * Advertised as `_career-ops._tcp.local` with the running port. TXT
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

export function startMdnsAdvertise(opts: AdvertiseOptions): void {
  try {
    // Lazy-require so a missing dep doesn't break the whole main process.
    // bonjour-service is added to the electron/package.json deps.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Bonjour } = require('bonjour-service');
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
