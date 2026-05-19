/**
 * Shared "double-click to confirm" gate for destructive actions.
 *
 * One instance per component (or per logical group of buttons). Each button
 * passes a unique `key` (e.g. the row id, or "delete" / "clear") so the same
 * gate can guard several actions side-by-side without crosstalk.
 *
 * Behaviour:
 *   First click  → arms the action and turns the button red. A 3s timer auto-
 *                  disarms if the user walks away.
 *   Second click → executes (and disarms).
 *   Click on a different key → re-arms for that key (the previous one disarms).
 *
 * Usage:
 *   const confirm = new ConfirmGate();
 *
 *   function onRemove(idx: number) {
 *     if (!confirm.trigger('chip:' + idx)) return;   // first click -- arm
 *     items.splice(idx, 1);                          // second click -- go
 *   }
 *
 *   <button class={confirm.isArmed('chip:' + i) ? 'red-tinted' : 'muted'}>
 *     <X />
 *   </button>
 *
 *   onDestroy(() => confirm.destroy());              // cleanup the timer
 */

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
    if (this.timer) clearTimeout(this.timer);
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
