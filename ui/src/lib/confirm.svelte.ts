/** Double-click-to-confirm gate for destructive actions. One instance
 *  per component; each button passes a unique `key` so multiple actions
 *  on the same page don't crosstalk. First click arms (3s auto-disarm),
 *  second click fires + disarms, clicking a different key swaps arm. */

export class ConfirmGate {
  // The single key currently armed, or null. Reactive via Svelte 5 runes.
  armedKey = $state<string | null>(null);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly timeoutMs: number;

  constructor(timeoutMs = 3000) {
    this.timeoutMs = timeoutMs;
  }

  isArmed(key: string): boolean {
    return this.armedKey === key;
  }

  /**
   * Process a click on `key`. Returns true if the action should fire
   * (the user has confirmed); false if this was the first click and we
   * just armed it.
   */
  trigger(key: string): boolean {
    if (this.armedKey === key) {
      this.disarm();
      return true;
    }
    this.arm(key);
    return false;
  }

  arm(key: string) {
    this.armedKey = key;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.disarm(), this.timeoutMs);
  }

  disarm() {
    this.armedKey = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Call from onDestroy / $effect cleanup so the timer doesn't leak. */
  destroy() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.armedKey = null;
  }
}
