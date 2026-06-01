<!--
  ValidatedInput — a regular Input that runs a validator and surfaces the
  result inline. Used everywhere a free-text field has a known shape (email,
  phone, URL, etc.) so the user gets immediate feedback instead of a server
  bounce on save.

  Validators come from `$lib/validators` and have shape `(value) => { ok, message? }`.
  The `oninput` callback fires on every keystroke; the validator is re-run
  inside this component (the parent doesn't need to know about validation
  state — just the raw value).

  Visual treatment when invalid:
    * Red ring + red text in the input
    * Tiny error icon at the right edge of the input
    * Hover/focus tooltip with the validator's message
    * Inline error text below (can be hidden with `inlineError={false}`)
  When valid (and non-empty), a tiny green check appears on the right.

  By default the validator only runs after the user has BLURRED the field
  once — typing in a fresh field doesn't show errors prematurely. Pass
  `validateOn="input"` to show errors on every keystroke instead.
-->
<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { AlertCircle, Check } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import type { ValidationResult } from '$lib/validators';

  let {
    value = $bindable(''),
    validate,
    required = false,
    placeholder,
    type = 'text',
    class: className = '',
    /** When to surface validation errors. */
    validateOn = 'blur' as 'blur' | 'input',
    /** Render the inline error text under the input. */
    inlineError = true,
    disabled = false,
    ariaLabel,
    /** Mirror Input's oninput so callers using patch-style updates still work. */
    oninput,
    /** Stable id so a parent validation summary can focus this input on click. */
    id,
  }: {
    value?: string;
    validate?: (v: string) => ValidationResult;
    required?: boolean;
    placeholder?: string;
    type?: string;
    class?: string;
    validateOn?: 'blur' | 'input';
    inlineError?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
    oninput?: (e: Event) => void;
    id?: string;
  } = $props();

  let touched = $state(false);

  /**
   * The validation envelope. Combines required + custom validator and
   * returns:
   *   { state: 'idle' }      -- empty, optional, or not yet touched
   *   { state: 'valid' }     -- non-empty and passes the validator
   *   { state: 'invalid', message } -- fails some check
   */
  type State = { state: 'idle' } | { state: 'valid' } | { state: 'invalid'; message: string };

  let result = $derived.by<State>(() => {
    const v = (value ?? '').trim();
    if (required && !v) return { state: 'invalid', message: 'Required' };
    if (!v) return { state: 'idle' };
    if (validate) {
      const r = validate(v);
      if (!r.ok) return { state: 'invalid', message: r.message };
    }
    return { state: 'valid' };
  });

  let showError = $derived(result.state === 'invalid' && (validateOn === 'input' || touched));
  // Show the green check whenever the value passes the validator. We used to
  // gate this on `touched` so a fresh field wouldn't show the check before
  // the user interacted with it -- but if the parent seeds the field with a
  // valid value (typical on profile reload), the user expects to see the
  // ✓ immediately. Errors still wait for blur (see showError) so a partial
  // value mid-type doesn't surface "Required" prematurely.
  let showOk = $derived(result.state === 'valid');
  let errorMessage = $derived(result.state === 'invalid' ? result.message : '');
</script>

<div class={cn('relative w-full', className)}>
  <Input
    bind:value
    {id}
    {placeholder}
    {type}
    {disabled}
    aria-label={ariaLabel}
    aria-invalid={showError}
    onblur={() => (touched = true)}
    {oninput}
    class={cn(
      'h-9 text-sm pr-8 transition-colors',
      showError &&
        'border-destructive/50 ring-1 ring-destructive/30 focus-visible:ring-destructive/40 focus-visible:border-destructive/60',
      showOk && 'border-success/30',
    )}
  />

  <!-- Status icon at right edge -- explains itself via tooltip. -->
  {#if showError}
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <span
              {...props}
              class="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 inline-flex items-center justify-center text-destructive cursor-help"
            >
              <AlertCircle class="size-3.5" />
            </span>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content
          side="left"
          class="text-xs max-w-xs bg-red-500/95 text-white border-red-500"
        >
          {errorMessage}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  {:else if showOk}
    <span
      class="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 inline-flex items-center justify-center text-success pointer-events-none"
      aria-hidden="true"
    >
      <Check class="size-3.5" />
    </span>
  {/if}

  {#if showError && inlineError}
    <p class="text-[11px] text-destructive/90 leading-tight mt-1 flex items-center gap-1">
      <AlertCircle class="size-2.5 flex-shrink-0" />
      {errorMessage}
    </p>
  {/if}
</div>
