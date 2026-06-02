/**
 * Bridges the Electron native File-menu auth actions into the SvelteKit
 * renderer. The main process (index.ts) sends `<brand>:menu:navigate` (a path)
 * and `<brand>:menu:passkey`; this turns them into a client navigation and a
 * passkey sign-in.
 *
 * The login page owns the actual passkey ceremony, so it registers its sign-in
 * fn (via setPasskeyTrigger) while mounted. If a passkey request arrives while
 * we're NOT on the login page, we navigate there first and fire it once the
 * page registers (one-shot pending flag).
 *
 * Web/iOS have no `window.electronAPI`, so installAuthMenuBridge is a no-op
 * there.
 */
import { goto } from '$app/navigation';
import { BRAND } from './brand';

let passkeyTrigger: (() => void) | null = null;
let pendingPasskey = false;

/** Login page registers its sign-in fn on mount, clears it (null) on destroy. */
export function setPasskeyTrigger(fn: (() => void) | null): void {
  passkeyTrigger = fn;
  if (fn && pendingPasskey) {
    pendingPasskey = false;
    fn();
  }
}

function requestPasskey(): void {
  if (passkeyTrigger) {
    passkeyTrigger();
  } else {
    // Not on the login page yet -- go there, then the page's setPasskeyTrigger
    // will flush this pending request.
    pendingPasskey = true;
    void goto('/login');
  }
}

type ElectronBridge = {
  electronAPI?: {
    on?: (channel: string, handler: (...args: unknown[]) => void) => (() => void) | void;
  };
};

/** Wire the Electron menu IPC -> renderer. Returns a cleanup fn (no-op off
 *  Electron). */
export function installAuthMenuBridge(): () => void {
  if (typeof window === 'undefined') return () => {};
  const api = (window as unknown as ElectronBridge).electronAPI;
  if (!api?.on) return () => {};
  const offNav = api.on(`${BRAND.name}:menu:navigate`, (path: unknown) => {
    if (typeof path === 'string') void goto(path);
  });
  const offPasskey = api.on(`${BRAND.name}:menu:passkey`, () => requestPasskey());
  return () => {
    offNav?.();
    offPasskey?.();
  };
}
