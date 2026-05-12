<script lang="ts">
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import { User, ArrowRight, ArrowLeft, Loader2 } from '@lucide/svelte';
import { goto } from '$app/navigation';
import { api, ApiError } from '$lib/api';
import { toast } from 'svelte-sonner';
import { onMount } from 'svelte';

let { data }: { data: { initial: Record<string, string>; profileId: string } } = $props();

/** Query suffix that threads the active wizard profile through every
 *  cross-route API call + Continue link. Without this, adding a second
 *  profile would write to whatever happens to be active at submit time. */
let q = $derived('?profile=' + encodeURIComponent(data.profileId));

// svelte-ignore state_referenced_locally — initial seed only
let form = $state({ ...data.initial });
let saving = $state(false);

// Auto-detect timezone on first mount if the user hasn't filled it in.
onMount(() => {
  if (!form.timezone) {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) form = { ...form, timezone: tz };
    } catch {
      /* not supported in this runtime */
    }
  }
});

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

async function saveAndContinue() {
  if (saving) return;
  if (!form.full_name.trim()) {
    toast.error('Full name required');
    return;
  }
  if (!form.email.trim() || !isEmail(form.email)) {
    toast.error('Valid email required');
    return;
  }
  saving = true;
  try {
    // Translate flat form fields into the nested ProfileEdit shape that
    // /api/profile expects. Empty strings are filtered out so we don't
    // overwrite existing values with empties when the user resumes.
    const patch: Record<string, unknown> = {
      candidate: stripEmpty({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        linkedin: form.linkedin,
        github: form.github,
        portfolio_url: form.portfolio_url,
      }),
      location: stripEmpty({
        city: form.location_city,
        country: form.location_country,
        province: form.location_province,
        timezone: form.timezone,
        visa_status: form.visa_status,
      }),
    };
    await api.post('/api/profile' + q, patch, { silent: true });
    await api.post(
      '/api/onboarding/step',
      { step: 'identity', action: 'complete' },
      { silent: true },
    );
    toast.success('Identity saved');
    await goto('/onboarding/cv' + q);
  } catch (e) {
    const err = e as ApiError;
    toast.error('Could not save', { description: err.message });
    saving = false;
  }
}

function stripEmpty(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v && v.trim()));
}
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
      <User class="size-5 text-blue-400" />
      Identity
    </h1>
    <p class="text-sm text-muted-foreground leading-relaxed max-w-xl">
      Basic personal info — used by the CV-tailoring + cover-letter modes (so they sign as
      <em>you</em>, not the AI's default), and by the LinkedIn / Indeed scrapers (which need
      a location to focus search results). Nothing here is sent to any third party.
    </p>
  </header>

  <div class="space-y-4">
    <!-- Required block -->
    <div class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Required</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label for="full_name" class="text-xs">Full name</Label>
          <Input id="full_name" bind:value={form.full_name} placeholder="[redacted-name]" class="text-sm" />
        </div>
        <div>
          <Label for="email" class="text-xs">Email</Label>
          <Input id="email" type="email" bind:value={form.email} placeholder="you@example.com" class="text-sm" />
        </div>
      </div>
    </div>

    <!-- Location block -->
    <div class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</h2>
      <p class="text-[11px] text-muted-foreground/80">
        City + country drive LinkedIn / Indeed search location. Timezone is auto-detected from your
        browser.
      </p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <Label for="city" class="text-xs">City</Label>
          <Input id="city" bind:value={form.location_city} placeholder="Vancouver" class="text-sm" />
        </div>
        <div>
          <Label for="province" class="text-xs">Province / State</Label>
          <Input id="province" bind:value={form.location_province} placeholder="BC" class="text-sm" />
        </div>
        <div>
          <Label for="country" class="text-xs">Country</Label>
          <Input id="country" bind:value={form.location_country} placeholder="Canada" class="text-sm" />
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label for="timezone" class="text-xs">Timezone</Label>
          <Input id="timezone" bind:value={form.timezone} placeholder="America/Vancouver" class="text-sm font-mono" />
        </div>
        <div>
          <Label for="visa" class="text-xs">Work auth / visa status</Label>
          <Input id="visa" bind:value={form.visa_status} placeholder="Canadian citizen, eligible to work in CA + US" class="text-sm" />
        </div>
      </div>
    </div>

    <!-- Optional block -->
    <div class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Links (optional)</h2>
      <p class="text-[11px] text-muted-foreground/80">
        Used by the CV-tailoring + outreach modes to surface relevant proof points (your LinkedIn
        profile background, public GitHub work, portfolio pieces). Skip any you don't have.
      </p>
      <div class="space-y-2">
        <div>
          <Label for="phone" class="text-xs">Phone (optional)</Label>
          <Input id="phone" type="tel" bind:value={form.phone} placeholder="+1 555 555 5555" class="text-sm" />
        </div>
        <div>
          <Label for="linkedin" class="text-xs">LinkedIn URL</Label>
          <Input id="linkedin" type="url" bind:value={form.linkedin} placeholder="https://www.linkedin.com/in/your-handle" class="text-sm" />
        </div>
        <div>
          <Label for="github" class="text-xs">GitHub URL</Label>
          <Input id="github" type="url" bind:value={form.github} placeholder="https://github.com/your-handle" class="text-sm" />
        </div>
        <div>
          <Label for="portfolio" class="text-xs">Portfolio URL</Label>
          <Input id="portfolio" type="url" bind:value={form.portfolio_url} placeholder="https://your-site.com" class="text-sm" />
        </div>
      </div>
    </div>
  </div>

  <div class="flex items-center justify-between pt-4 border-t border-border/40">
    <a href="/onboarding/api-keys" class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
      <ArrowLeft class="size-3" /> Back
    </a>
    <Button onclick={saveAndContinue} disabled={saving} class="gap-1.5">
      {#if saving}<Loader2 class="size-3.5 animate-spin" /> Saving…{:else}Continue<ArrowRight class="size-4" />{/if}
    </Button>
  </div>
</div>
