/**
 * Mounts the "dawn motes" tsParticles effect into every `[data-heron-particles]`
 * element on the page (each is a positioned zone -- top-right / bottom band -- so
 * the motes cluster where the host div sits). One slim engine, loaded once,
 * shared by the SvelteKit pages and the splash surfaces.
 *
 * Honors `prefers-reduced-motion`: if the user prefers reduced motion we mount
 * nothing (no animation at all).
 */
import { tsParticles, type Container } from '@tsparticles/engine';
import { loadSlim } from '@tsparticles/slim';
import { loadWobbleUpdater } from '@tsparticles/updater-wobble';
import { heronParticleOptions, type Zone } from './config';

let enginePromise: Promise<void> | null = null;
const containers: Container[] = [];

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export async function mountHeronParticles(): Promise<void> {
  if (typeof document === 'undefined' || reducedMotion()) return;
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-heron-particles]')).filter(
    (el) => !el.dataset.heronParticlesMounted,
  );
  if (!els.length) return;
  if (!enginePromise) {
    // slim gives circle/move/opacity/size/out-modes; wobble is a separate
    // updater slim omits, so load it too for the organic sway.
    enginePromise = loadSlim(tsParticles)
      .then(() => loadWobbleUpdater(tsParticles))
      .then(() => undefined);
  }
  await enginePromise;
  for (const el of els) {
    if (el.dataset.heronParticlesMounted) continue;
    el.dataset.heronParticlesMounted = '1';
    if (!el.id) el.id = 'heron-particles-' + Math.random().toString(36).slice(2, 8);
    const zone: Zone = el.dataset.zone === 'top-right' ? 'top-right' : 'bottom';
    const count = Number(el.dataset.count) || 12;
    const container = await tsParticles.load({
      id: el.id,
      element: el,
      options: heronParticleOptions(zone, count),
    });
    if (container) containers.push(container);
  }
}

export function destroyHeronParticles(): void {
  for (const c of containers.splice(0)) {
    try {
      c.destroy();
    } catch {
      /* already gone */
    }
  }
  document
    .querySelectorAll<HTMLElement>('[data-heron-particles][data-heron-particles-mounted]')
    .forEach((el) => delete el.dataset.heronParticlesMounted);
}
