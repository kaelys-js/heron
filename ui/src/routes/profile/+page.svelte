<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import ChipListEditor from '$lib/components/ChipListEditor.svelte';
  import ProofPointEditor from '$lib/components/ProofPointEditor.svelte';
  import CvManagerSheet from '$lib/components/CvManagerSheet.svelte';
  import CollapsibleCard from '$lib/components/CollapsibleCard.svelte';
  import RichTextarea from '$lib/components/RichTextarea.svelte';
  import ResetProfileDialog from '$lib/components/ResetProfileDialog.svelte';
  import ConfirmButton from '$lib/components/ConfirmButton.svelte';
  import FormAnswersCard, { type FormAnswer } from '$lib/components/FormAnswersCard.svelte';
  import ValidatedInput from '$lib/components/ValidatedInput.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import {
    validateEmail, validatePhone, validateLinkedIn, validateGitHub,
    validateTwitter, validatePortfolio, validateUrl, type ValidationResult,
  } from '$lib/validators';
  import { COUNTRIES } from '$lib/data/countries';
  import { statesForCountry } from '$lib/data/states';
  import { CURRENCIES } from '$lib/data/currencies';
  import { VISA_OPTIONS, ONSITE_OPTIONS } from '$lib/data/visa';
  import { TIMEZONES } from '$lib/data/timezones';
  import { TARGET_RANGE_OPTIONS, WALKAWAY_OPTIONS, LOCATION_FLEX_OPTIONS } from '$lib/data/comp';
  import {
    User, MapPin, Target as TargetIcon, Sparkles, DollarSign, ShieldAlert, FileText, Mic2,
    AlertCircle, AlertTriangle, ChevronRight, ExternalLink, FileCode, Copy, Check, Eye, Pencil, ReplaceAll, Wand2, Trash2, Briefcase, Loader2,
    RotateCw,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { cn, withMinDuration } from '$lib/utils';
  import type { ProfileSnapshot, ProfileEdit } from '$lib/server/profile';
  import type { GeneralCvStatus } from '$lib/server/cv-pdf';
  // ConfirmGate import removed — the Discard button now uses ConfirmButton
  // (which encapsulates the gate). Other places on this page that need the
  // gate import directly should re-add this line as needed.
  import { onDestroy, onMount } from 'svelte';

  let { data }: {
    data: {
      profileId: string;
      profile: ProfileSnapshot;
      generalCv: GeneralCvStatus;
      formAnswers: FormAnswer[];
      formAnswersStats: { total: number; usedToday: number; lastUpdatedAt: number | null };
    };
  } = $props();

  // Project a ProfileSnapshot down to JUST the editable ProfileEdit shape.
  // Without this, structuredClone(data.profile) would seed `edit` with all
  // the snapshot's read-only metadata (archetypes, files, exists) — and the
  // dirty-comparison would always evaluate true because `edit` carried extra
  // keys the right-hand side didn't. Symmetric snapshot fixes that.
  function snapshotEdit(p: ProfileSnapshot): ProfileEdit {
    return {
      candidate: structuredClone(p.candidate ?? {}),
      target_roles: structuredClone(p.target_roles ?? {}),
      narrative: structuredClone(p.narrative ?? {}),
      compensation: structuredClone(p.compensation ?? {}),
      location: structuredClone(p.location ?? {}),
      preferences: structuredClone(p.preferences ?? {}),
      language: structuredClone(p.language ?? {}),
      // Carry the automation block through so the autonomous-apply card
      // can edit it in place. snapshotEdit was originally written before
      // this block existed — including it now keeps the dirty-compare
      // and PUT round-trip symmetric.
      automation: structuredClone(p.automation ?? {}),
    };
  }

  // CV manager sheet — opens with the appropriate tab based on which button the user clicks.
  type CvTab = 'view' | 'edit' | 'replace' | 'reprocess';
  let cvOpen = $state(false);
  let cvInitialTab = $state<CvTab>('view');
  // Reset dialog — type RESET to enable the destructive button.
  // initialScope lets the danger-zone "Clear jobs…" button open the dialog
  // pre-selected on the jobs scope, while the generic "Reset…" button
  // defaults to profile.
  let resetOpen = $state(false);
  let resetInitialScope = $state<'profile' | 'jobs' | 'everything'>('profile');

  // General-CV PDF generation state. The general CV is what gets uploaded
  // by LinkedIn Easy Apply (where consistency with the LinkedIn profile
  // matters); per-job tailored CVs continue to be used for non-LinkedIn
  // portals.
  // svelte-ignore state_referenced_locally — initial seed only
  let generalCv = $state<GeneralCvStatus>(data.generalCv);
  let generatingGeneralCv = $state(false);

  // Story bank state — refreshed on mount + after seeding.
  type StoryBankStats = { exists: boolean; storyCount: number; lastUpdatedAt: number | null; bytes?: number };
  let storyBankStats = $state<StoryBankStats | null>(null);
  let seedingStoryBank = $state(false);

  async function refreshStoryBankStats() {
    try {
      const r = await api.get<StoryBankStats>('/api/profile/seed-story-bank', { silent: true });
      storyBankStats = r;
    } catch {
      storyBankStats = { exists: false, storyCount: 0, lastUpdatedAt: null };
    }
  }

  async function seedStoryBank() {
    if (seedingStoryBank) return;
    seedingStoryBank = true;
    try {
      const r = await withMinDuration(
        api.post<{
          ok: boolean;
          seeded?: number;
          grewBy?: number;
          bankPath?: string;
          summary?: string;
          error?: string;
        }>('/api/profile/seed-story-bank?profile=' + encodeURIComponent(data.profileId), {}, { silent: true }),
        600,
      );
      if (r.ok) {
        toast.success('Story bank seeded', {
          description: (r.summary ?? 'OK') + ' · file grew by ' + (r.grewBy ?? 0) + ' bytes',
          duration: 8_000,
        });
        await refreshStoryBankStats();
      } else {
        toast.error('Seeding failed', { description: r.error ?? 'unknown' });
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('Seeding failed', { description: err.message });
    } finally {
      seedingStoryBank = false;
    }
  }

  // Load story-bank stats on mount.
  onMount(() => { refreshStoryBankStats(); });

  /** Re-fetch the general-CV status from the dedicated endpoint. Used after
   *  external mutations (CV manager replace / reprocess) or to check
   *  whether a stale PDF flag has cleared without forcing a page reload. */
  async function refetchGeneralCvStatus(): Promise<void> {
    try {
      const r = await api.get<GeneralCvStatus>(
        '/api/profile/general-cv/status?profile=' + encodeURIComponent(data.profileId),
        { silent: true },
      );
      generalCv = r;
    } catch { /* leave previous snapshot in place */ }
  }

  async function generateGeneralCvNow() {
    if (generatingGeneralCv) return;
    generatingGeneralCv = true;
    try {
      const r = await withMinDuration(
        api.post<GeneralCvStatus & { pages?: number }>(
          '/api/profile/general-cv/generate',
          {},
          { silent: true },
        ),
        500,
      );
      generalCv = r;
      toast.success('General CV generated', {
        description:
          'output/cv-general.pdf · ' +
          (r.bytes ? (r.bytes / 1024).toFixed(1) + ' KB' : '') +
          (r.pages ? ' · ' + r.pages + ' page' + (r.pages === 1 ? '' : 's') : '') +
          ' · this is what LinkedIn Easy Apply uploads from now on.',
        duration: 8_000,
      });
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Generation failed', {
        description: err.message,
        action: { label: 'Retry', onClick: () => generateGeneralCvNow() },
        duration: 14_000,
      });
    } finally {
      generatingGeneralCv = false;
    }
  }

  function fmtAge(ts: number): string {
    const dt = Date.now() - ts;
    if (dt < 60_000) return 'just now';
    if (dt < 3_600_000) return Math.floor(dt / 60_000) + 'm ago';
    if (dt < 86_400_000) return Math.floor(dt / 3_600_000) + 'h ago';
    return Math.floor(dt / 86_400_000) + 'd ago';
  }

  function openCv(tab: CvTab) {
    cvInitialTab = tab;
    cvOpen = true;
  }

  /**
   * Merge a Claude-extracted profile suggestion into the local edit state.
   * Only fills empty fields by default — never clobbers something the user
   * already typed. Marks the form dirty so the sticky Save bar appears.
   */
  function applyCvSuggestion(suggestion: {
    candidate?: NonNullable<ProfileEdit['candidate']>;
    narrative?: NonNullable<ProfileEdit['narrative']>;
    location?: NonNullable<ProfileEdit['location']>;
  }) {
    const next: ProfileEdit = structuredClone(edit);
    if (suggestion.candidate) {
      const cur = next.candidate ?? {};
      const proposed = suggestion.candidate;
      next.candidate = {
        full_name: cur.full_name?.trim() ? cur.full_name : (proposed.full_name ?? cur.full_name),
        email: cur.email?.trim() ? cur.email : (proposed.email ?? cur.email),
        phone: cur.phone?.trim() ? cur.phone : (proposed.phone ?? cur.phone),
        location: cur.location?.trim() ? cur.location : (proposed.location ?? cur.location),
        linkedin: cur.linkedin?.trim() ? cur.linkedin : (proposed.linkedin ?? cur.linkedin),
        github: cur.github?.trim() ? cur.github : (proposed.github ?? cur.github),
        portfolio_url: cur.portfolio_url?.trim() ? cur.portfolio_url : (proposed.portfolio_url ?? cur.portfolio_url),
        twitter: cur.twitter?.trim() ? cur.twitter : (proposed.twitter ?? cur.twitter),
      };
    }
    if (suggestion.narrative) {
      const cur = next.narrative ?? {};
      const proposed = suggestion.narrative;
      next.narrative = {
        headline: cur.headline?.trim() ? cur.headline : (proposed.headline ?? cur.headline),
        exit_story: cur.exit_story?.trim() ? cur.exit_story : (proposed.exit_story ?? cur.exit_story),
        superpowers: (cur.superpowers && cur.superpowers.length > 0) ? cur.superpowers : (proposed.superpowers ?? cur.superpowers ?? []),
        proof_points: (cur.proof_points && cur.proof_points.length > 0) ? cur.proof_points : (proposed.proof_points ?? cur.proof_points ?? []),
      };
    }
    if (suggestion.location) {
      const cur = next.location ?? {};
      const proposed = suggestion.location;
      next.location = {
        ...cur,
        city: cur.city?.trim() ? cur.city : (proposed.city ?? cur.city),
        province: cur.province?.trim() ? cur.province : (proposed.province ?? cur.province),
        country: cur.country?.trim() ? cur.country : (proposed.country ?? cur.country),
        timezone: cur.timezone?.trim() ? cur.timezone : (proposed.timezone ?? cur.timezone),
      };
    }
    edit = next;
  }

  // svelte-ignore state_referenced_locally — server data seeds local mutable state.
  let edit = $state<ProfileEdit>(snapshotEdit(data.profile));
  let saving = $state(false);

  // Both sides of the comparison go through the same projection so extra
  // metadata never poisons the dirty check.
  let dirty = $derived(JSON.stringify(edit) !== JSON.stringify(snapshotEdit(data.profile)));

  async function save() {
    if (!dirty || saving) return;
    saving = true;
    try {
      await withMinDuration(
        api.post('/api/profile', edit, { successToast: { title: 'Profile saved', description: 'config/profile.yml updated.' } }),
        500,
      );
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to save profile', { description: err.message });
    } finally {
      saving = false;
    }
  }

  // Discard throws away typed work. The ConfirmButton component below
  // handles the double-click gate itself, so this function just performs
  // the actual reset when the second click fires.
  function discardImmediate() {
    edit = snapshotEdit(data.profile);
  }

  // The Province/State combobox is contextual: structured list for US/CA/AU,
  // free-text everywhere else. Recomputes whenever the user changes country.
  let provinceItems = $derived(
    statesForCountry(edit.location?.country ?? '').map((s) => ({
      value: s.name,
      label: s.name,
      description: s.code,
    })),
  );

  // ---- Form-wide validation rollup ----
  // Each entry: { id, label, section, message }. Renders into the sticky
  // banner at the top of the page, and each entry can be clicked to focus
  // the field that owns it. The IDs match the input id= attributes added
  // to each ValidatedInput so document.getElementById(id).focus() works.
  type FieldError = { id: string; label: string; section: string; message: string };
  let validationErrors = $derived.by<FieldError[]>(() => {
    const out: FieldError[] = [];
    for (const f of IDENTITY_FIELDS) {
      const v = edit.candidate?.[f.key] ?? '';
      if (f.required) {
        if (!v.trim()) {
          out.push({ id: 'profile-' + f.key, label: f.label, section: 'Identity', message: 'Required' });
          continue;
        }
      }
      if (v.trim() && f.validate) {
        const r = f.validate(v);
        if (!r.ok) out.push({ id: 'profile-' + f.key, label: f.label, section: 'Identity', message: r.message });
      }
    }
    // Proof points: validate URL of each
    const pps = edit.narrative?.proof_points ?? [];
    pps.forEach((p, i) => {
      if (p.url && p.url.trim()) {
        const r = validateUrl(p.url);
        if (!r.ok) {
          out.push({
            id: 'profile-proof-' + i,
            label: 'Proof point #' + (i + 1) + (p.name ? ' (' + p.name + ')' : '') + ' · URL',
            section: 'Narrative',
            message: r.message,
          });
        }
      }
    });
    return out;
  });

  /** Scroll-to + focus the field tied to a given error so the user can fix it. */
  function jumpToError(id: string) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(id) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      const focusable = el as HTMLInputElement;
      if (typeof focusable.focus === 'function') focusable.focus();
    }, 250);
  }

  // Update helpers — keep edit immutable so $derived recomputes
  function patchCandidate(patch: Partial<NonNullable<ProfileEdit['candidate']>>) {
    edit = { ...edit, candidate: { ...edit.candidate, ...patch } };
  }
  function patchNarrative(patch: Partial<NonNullable<ProfileEdit['narrative']>>) {
    edit = { ...edit, narrative: { ...edit.narrative, ...patch } };
  }
  function patchComp(patch: Partial<NonNullable<ProfileEdit['compensation']>>) {
    edit = { ...edit, compensation: { ...edit.compensation, ...patch } };
  }
  function patchLocation(patch: Partial<NonNullable<ProfileEdit['location']>>) {
    edit = { ...edit, location: { ...edit.location, ...patch } };
  }

  let copiedKey = $state<string | null>(null);
  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedKey = key;
      setTimeout(() => { if (copiedKey === key) copiedKey = null; }, 1500);
    } catch {
      toast.error('Copy failed');
    }
  }

  type FieldDef = {
    key: keyof NonNullable<ProfileEdit['candidate']>;
    label: string;
    type?: 'text' | 'email' | 'tel' | 'url';
    placeholder?: string;
    span?: 1 | 2;
    /** Optional one-line hint shown under the input. Use to disambiguate
     *  fields whose purpose isn't obvious from the label alone. */
    hint?: string;
    /** Validator from $lib/validators. Empty/optional fields always pass. */
    validate?: (v: string) => ValidationResult;
    required?: boolean;
  };
  const IDENTITY_FIELDS: FieldDef[] = [
    { key: 'full_name',    label: 'Full name',     placeholder: 'Cole B', hint: 'Exactly as it should appear on the CV header.', required: true },
    { key: 'email',        label: 'Email',         type: 'email', placeholder: 'you@example.com', hint: 'Public contact email — recruiters reply here.', validate: validateEmail, required: true },
    { key: 'phone',        label: 'Phone',         type: 'tel',   placeholder: '+1-555-0123', hint: 'Optional. Include country code if you\'re open to international calls.', validate: validatePhone },
    { key: 'location',     label: 'Display location', placeholder: 'Vancouver, BC, Canada', hint: 'Free-form text for the CV header. The structured Location section below feeds visa + remote-fit analysis.' },
    { key: 'linkedin',     label: 'LinkedIn',      placeholder: 'linkedin.com/in/you', hint: 'Bare URL works (no https://). Boosts credibility for tech roles.', validate: validateLinkedIn },
    { key: 'github',       label: 'GitHub',        placeholder: 'github.com/you', hint: 'For engineering roles, this carries real weight if your repos are public.', validate: validateGitHub },
    { key: 'portfolio_url', label: 'Portfolio',    type: 'url',   placeholder: 'https://you.dev', span: 2, hint: 'Project gallery, blog, or personal site. Surfaced in cover letters as "see <portfolio>".', validate: validatePortfolio },
    { key: 'twitter',      label: 'Twitter / X',   placeholder: 'x.com/you', hint: 'Optional. Mostly relevant for DevRel / community-facing roles.', validate: validateTwitter },
  ];
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="Profile"

    subtitle={data.profile.exists ? undefined : 'first-run defaults'}
    showTabs={false}
  />

  <div class="p-6 pb-24">
    <div class="max-w-3xl mx-auto space-y-5">
      <!-- Hero -->
      <div class="space-y-2">
        <h1 class="text-xl font-semibold tracking-tight">Your profile</h1>
        <p class="text-sm text-muted-foreground leading-relaxed">
          Everything the system knows about you. Every job evaluation, tailored CV PDF, cover letter,
          interview-prep brief, and offer-negotiation draft reads from this page. The more accurate
          and specific these fields are, the better the matching, scoring, and writing the AI does on your behalf.
        </p>
        <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
          Stored locally in <code class="text-foreground/80 font-mono">config/profile.yml</code> — never
          uploaded anywhere. Empty fields are tolerated; the AI just can't reference what it doesn't know.
        </p>
      </div>

      {#if !data.profile.exists}
        <div class="flex items-start gap-2 px-3 py-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-xs">
          <AlertCircle class="size-3.5 text-amber-300 mt-0.5 flex-shrink-0" />
          <div class="text-amber-200/90 leading-relaxed">
            <strong>First run:</strong> the form below shows an example profile so you can see what
            populates. Replace anything example-like with your own answers and click <strong>Save profile</strong> —
            we'll create <code class="font-mono">config/profile.yml</code> on disk with your data and never write to it again unless you save more changes.
          </div>
        </div>
      {/if}

      <!--
        Validation summary — only renders when at least one field has a problem.
        Each entry is a button so the user can click to scroll-to-and-focus
        the offending input. Grouped subtly by section in the message text so
        the user can see at-a-glance which area needs attention.
      -->
      {#if validationErrors.length > 0}
        <div
          class="rounded-md border border-red-500/40 bg-red-500/[0.08] overflow-hidden"
          role="alert"
          aria-live="polite"
        >
          <div class="flex items-start gap-2 px-3.5 py-2.5 border-b border-red-500/20 bg-red-500/[0.06]">
            <AlertTriangle class="size-3.5 text-red-300 mt-0.5 flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="text-xs font-medium text-red-200">
                {validationErrors.length} {validationErrors.length === 1 ? 'field needs' : 'fields need'} attention
              </div>
              <p class="text-[10px] text-red-200/70 leading-relaxed mt-0.5">
                Saving will fail (or strip data) for fields below. Click a row to jump to it.
              </p>
            </div>
          </div>
          <ul class="divide-y divide-red-500/15">
            {#each validationErrors as err (err.id)}
              <li>
                <button
                  type="button"
                  onclick={() => jumpToError(err.id)}
                  class="w-full flex items-center gap-2 px-3.5 py-2 text-left text-[11px] hover:bg-red-500/[0.06] transition-colors group/row"
                >
                  <span class="text-[10px] uppercase tracking-wider font-mono text-red-300/80 w-20 flex-shrink-0">{err.section}</span>
                  <span class="text-red-100 font-medium truncate flex-1 min-w-0">{err.label}</span>
                  <span class="text-red-300/90 truncate max-w-[50%]">— {err.message}</span>
                  <ChevronRight class="size-3 text-red-300/50 group-hover/row:translate-x-0.5 group-hover/row:text-red-200 transition-all flex-shrink-0" />
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- IDENTITY -->
      <CollapsibleCard
        title="Identity"
        description="Your contact info — name, email, phone, social links. Goes into the header of every CV PDF and the sign-off of cover-letter drafts. Recruiters see email + phone; LinkedIn / GitHub / portfolio links boost credibility on technical roles."
        storageKey="identity"
      >
        {#snippet icon()}<User class="size-3.5 text-muted-foreground" />{/snippet}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#each IDENTITY_FIELDS as f}
            <div class={cn('space-y-1.5', f.span === 2 && 'md:col-span-2')}>
              <Label class="text-xs flex items-center gap-1.5">
                {f.label}
                {#if f.required}<span class="text-red-400" aria-label="required" title="Required">*</span>{/if}
              </Label>
              <ValidatedInput
                id={'profile-' + f.key}
                type={f.type ?? 'text'}
                value={edit.candidate?.[f.key] ?? ''}
                oninput={(e: Event) => patchCandidate({ [f.key]: (e.currentTarget as HTMLInputElement).value } as any)}
                placeholder={f.placeholder}
                validate={f.validate}
                required={f.required}
                ariaLabel={f.label}
              />
              {#if f.hint}
                <p class="text-[10px] text-muted-foreground/70 leading-relaxed">{f.hint}</p>
              {/if}
            </div>
          {/each}
        </div>
      </CollapsibleCard>

      <!-- LOCATION -->
      <CollapsibleCard
        title="Location & work eligibility"
        description="Where you live and your right to work. Drives remote/hybrid/on-site fit during scoring (a posting that requires 'must work in NYC' won't score well if you're in Vancouver). Visa status appears in the legitimacy/eligibility block of every evaluation report so you can see whether sponsorship would be required upfront."
        storageKey="location"
      >
        {#snippet icon()}<MapPin class="size-3.5 text-muted-foreground" />{/snippet}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5 md:col-span-2">
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed -mt-1">
              These fields feed remote-fit analysis: a posting that requires a specific city or country mismatching yours
              gets flagged in the evaluation report. Timezone matters for "must overlap with US Pacific" type postings.
            </p>
          </div>
          <!-- Country first — drives whether the Province field has a structured list -->
          <div class="space-y-1.5">
            <Label class="text-xs">Country</Label>
            <Combobox
              items={COUNTRIES.map((c) => ({ value: c.name, label: c.name, description: c.code }))}
              value={edit.location?.country ?? ''}
              onchange={(v: string) => patchLocation({ country: v })}
              placeholder="Pick or type a country"
              searchPlaceholder="Search 60 countries…"
              customLabel="Use custom country"
              ariaLabel="Country"
            />
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">Province / State</Label>
            {#if provinceItems.length > 0}
              <Combobox
                items={provinceItems}
                value={edit.location?.province ?? ''}
                onchange={(v: string) => patchLocation({ province: v })}
                placeholder="Pick or type a {edit.location?.country ? 'state/province' : 'region'}"
                searchPlaceholder="Search…"
                customLabel="Use custom"
                ariaLabel="Province or state"
              />
            {:else}
              <Input
                value={edit.location?.province ?? ''}
                oninput={(e: Event) => patchLocation({ province: (e.currentTarget as HTMLInputElement).value })}
                placeholder="British Columbia"
                class="h-9 text-sm"
              />
            {/if}
            {#if edit.location?.country && provinceItems.length === 0}
              <p class="text-[10px] text-muted-foreground/60 leading-tight">
                No structured list for this country — type your region.
              </p>
            {/if}
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">City</Label>
            <Input
              value={edit.location?.city ?? ''}
              oninput={(e: Event) => patchLocation({ city: (e.currentTarget as HTMLInputElement).value })}
              placeholder="Vancouver"
              class="h-9 text-sm"
            />
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">Timezone</Label>
            <Combobox
              items={TIMEZONES.map((t) => ({ value: t.value, label: t.label, description: t.value + ' · ' + t.offset }))}
              value={edit.location?.timezone ?? ''}
              onchange={(v: string) => patchLocation({ timezone: v })}
              placeholder="Pick your timezone"
              searchPlaceholder="Search 60+ timezones…"
              customLabel="Use custom timezone"
              ariaLabel="Timezone"
            />
            <p class="text-[10px] text-muted-foreground/70 leading-tight">
              Stores the canonical IANA name (e.g. <code class="font-mono">America/Vancouver</code>). Used to assess overlap with US Pacific / Eastern hiring teams.
            </p>
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <Label class="text-xs">Visa / work-authorization status</Label>
            <Combobox
              items={VISA_OPTIONS.map((o) => ({ value: o.value, label: o.label, description: o.description }))}
              value={edit.location?.visa_status ?? ''}
              onchange={(v: string) => patchLocation({ visa_status: v })}
              placeholder="Pick the closest match — or type your own"
              searchPlaceholder="Search visa types…"
              customLabel="Describe your status"
              ariaLabel="Visa status"
            />
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              Surfaced in the eligibility block of every evaluation report so you see upfront whether sponsorship would be needed.
              Pick the closest dropdown option, or "Other / custom" for nuanced situations.
            </p>
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <Label class="text-xs">On-site availability</Label>
            <Combobox
              items={ONSITE_OPTIONS.map((o) => ({ value: o.value, label: o.label, description: o.description }))}
              value={edit.location?.onsite_availability ?? ''}
              onchange={(v: string) => patchLocation({ onsite_availability: v })}
              placeholder="Pick how often you'll come in — or type your own"
              searchPlaceholder="Search…"
              customLabel="Describe your availability"
              ariaLabel="On-site availability"
            />
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              Used by cover-letter drafts when a posting asks "can you come into the office N days/week?".
            </p>
          </div>
        </div>
      </CollapsibleCard>

      <!-- TARGET ROLES -->
      <CollapsibleCard
        title="Target roles"
        description="Job titles you actually want next. The Gemini first-pass and Claude deep-evaluation both compare each posting's title against this list — strong matches push the score up, mismatches push it down. Be specific: 'Senior Backend Engineer' is more useful than 'Software Engineer'."
        storageKey="target-roles"
      >
        {#snippet icon()}<TargetIcon class="size-3.5 text-muted-foreground" />{/snippet}
        <div class="space-y-4">
          <div class="space-y-1.5">
            <Label class="text-xs">Primary roles</Label>
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              The job titles you'd actually take. Each posting is title-matched against this list during scoring,
              and the best match becomes the framing in cover letters ("I'm interested in this {'<role>'} role…").
            </p>
            <ChipListEditor
              items={edit.target_roles?.primary ?? []}
              onchange={(next: string[]) => (edit = { ...edit, target_roles: { ...edit.target_roles, primary: next } })}
              placeholder="Senior Backend Engineer"
              emptyText="No primary roles yet — add a few titles you're aiming at."
            />
          </div>

          {#if data.profile.archetypes.length > 0}
            <div class="space-y-1.5 pt-3 border-t border-border/40">
              <Label class="text-xs flex items-center gap-2">
                Archetypes
                <span class="text-[10px] font-normal text-muted-foreground">read-only</span>
              </Label>
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                A higher-level role grouping (e.g. "Backend / Platform", "Founding Engineer") with a fit score per archetype.
                Used by Claude during deep evaluation to decide which CV bullets to prioritize. This is structured YAML
                that's easier to edit by hand in <code class="font-mono">config/profile.yml</code> for now.
              </p>
              <div class="flex flex-wrap gap-1.5 pt-1">
                {#each data.profile.archetypes as a}
                  <Badge variant="outline" class="text-[10px] h-5 px-1.5 font-normal">
                    {a.name}
                    {#if a.fit}
                      <span class="ml-1 text-muted-foreground/70">· {a.fit}</span>
                    {/if}
                  </Badge>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </CollapsibleCard>

      <!-- NARRATIVE -->
      <CollapsibleCard
        title="Narrative"
        description="Your story in your own words. Headline becomes the summary line on every CV PDF. Exit story drives the 'Why are you looking?' answer in cover letters and interview prep. Superpowers and proof points get pulled directly into tailored CV bullets and cover-letter intro paragraphs."
        storageKey="narrative"
      >
        {#snippet icon()}<Sparkles class="size-3.5 text-muted-foreground" />{/snippet}
        <div class="space-y-4">
          <div class="space-y-1.5">
            <Label class="text-xs">Headline</Label>
            <Input
              value={edit.narrative?.headline ?? ''}
              oninput={(e: Event) => patchNarrative({ headline: (e.currentTarget as HTMLInputElement).value })}
              placeholder="Senior Software Engineer — 10+ years TypeScript / React / Node / Cloud"
              class="h-9 text-sm"
            />
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              One line, surfaced as the summary on every CV PDF. Lead with seniority + stack so a recruiter knows the level + tech in 3 seconds.
            </p>
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">Exit story</Label>
            <RichTextarea
              value={edit.narrative?.exit_story ?? ''}
              oninput={(v: string) => patchNarrative({ exit_story: v })}
              placeholder="The 4–8 sentence story of what you've shipped, what you're about, and what you're looking for next."
              minRows={5}
              maxRows={14}
              ariaLabel="Exit story"
            />
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              4–8 sentences: what you've shipped recently · what kind of work energizes you · what you're looking for next.
              Pulled into cover-letter openers and the "Tell me about yourself" answer in interview prep.
              Markdown OK (⌘B / ⌘I / ⌘K).
            </p>
          </div>
          <div class="space-y-1.5 pt-2 border-t border-border/40">
            <Label class="text-xs">Superpowers</Label>
            <p class="text-[11px] text-muted-foreground/70 leading-relaxed">
              3–6 concrete capabilities — skills, not adjectives. <em class="not-italic text-foreground/80">"Production TypeScript end-to-end"</em>
              works · <em class="not-italic text-muted-foreground/60">"strong communicator"</em> doesn't. These become bullet points
              on tailored CVs and highlight phrases in cover letters.
            </p>
            <ChipListEditor
              items={edit.narrative?.superpowers ?? []}
              onchange={(next: string[]) => patchNarrative({ superpowers: next })}
              placeholder="Production TypeScript + React: end-to-end feature delivery"
            />
          </div>
          <div class="space-y-1.5 pt-2 border-t border-border/40">
            <Label class="text-xs">Proof points</Label>
            <p class="text-[11px] text-muted-foreground/70 leading-relaxed">
              Specific projects, articles, or wins with a metric. Each one becomes a citable bullet on tailored CVs and a reference
              in negotiation drafts ("at <em class="not-italic text-foreground/80">$company</em>, you led X with Y outcome — that's worth $Z").
            </p>
            <ProofPointEditor
              items={edit.narrative?.proof_points ?? []}
              onchange={(next: NonNullable<ProfileEdit['narrative']>['proof_points']) => patchNarrative({ proof_points: next })}
              idPrefix="profile-proof"
            />
          </div>
        </div>
      </CollapsibleCard>

      <!-- COMPENSATION -->
      <CollapsibleCard
        title="Compensation"
        description="Your salary expectations and walk-away point. Negotiation drafts use the target range when an offer arrives. Offer-comparison panels check each offer against your minimum so you can see at a glance whether it clears the bar. Notes carry forward into negotiation flows so anything you'd otherwise forget (equity preferences, deal-breakers) shows up at the right moment."
        storageKey="compensation"
      >
        {#snippet icon()}<DollarSign class="size-3.5 text-muted-foreground" />{/snippet}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5 md:col-span-2">
            <Label class="text-xs">Target range</Label>
            <Combobox
              items={TARGET_RANGE_OPTIONS}
              value={edit.compensation?.target_range ?? ''}
              onchange={(v: string) => patchComp({ target_range: v })}
              placeholder="Pick a tech-industry bracket — or type any range"
              searchPlaceholder="Search ranges…"
              customLabel="Use custom range"
              ariaLabel="Target compensation range"
            />
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              Where you'd realistically expect to land. Negotiation drafts use the upper bound as your "ask" and the lower as your "happy place."
              Brackets shown are USD tech baselines — use the custom option for non-USD or non-tech ranges.
            </p>
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">Currency</Label>
            <Combobox
              items={CURRENCIES.map((c) => ({ value: c.code, label: c.code + ' · ' + c.name, description: c.symbol + ' ' + c.name }))}
              value={edit.compensation?.currency ?? ''}
              onchange={(v: string) => patchComp({ currency: v })}
              placeholder="Pick a currency"
              searchPlaceholder="Search currencies…"
              customLabel="Use custom code"
              ariaLabel="Currency"
            />
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              ISO 4217 code. Used to normalize offers across postings.
            </p>
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">Walk-away minimum</Label>
            <Combobox
              items={WALKAWAY_OPTIONS}
              value={edit.compensation?.minimum ?? ''}
              onchange={(v: string) => patchComp({ minimum: v })}
              placeholder="Pick a floor — or type your own"
              searchPlaceholder="Search minimums…"
              customLabel="Use custom minimum"
              ariaLabel="Walk-away minimum"
            />
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              The number below which you'd say no. Offer-comparison flags any offer beneath this so you can decline cleanly.
            </p>
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <Label class="text-xs">Location flexibility</Label>
            <Combobox
              items={LOCATION_FLEX_OPTIONS}
              value={edit.compensation?.location_flexibility ?? ''}
              onchange={(v: string) => patchComp({ location_flexibility: v })}
              placeholder="Pick the closest fit — or type your own"
              searchPlaceholder="Search…"
              customLabel="Describe your flexibility"
              ariaLabel="Location flexibility"
            />
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              How willing you are to commute or relocate. Surfaced in cover letters when the role asks "Are you open to relocation?".
            </p>
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <Label class="text-xs">Negotiation notes</Label>
            <RichTextarea
              value={edit.compensation?.notes ?? ''}
              oninput={(v: string) => patchComp({ notes: v })}
              placeholder="Anything to remember when an offer arrives — equity preferences, deal-breakers, etc."
              minRows={4}
              maxRows={12}
              ariaLabel="Negotiation notes"
            />
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              Free-form notes that show up in the negotiation flow when an offer comes in. Equity preferences,
              "always ask for sign-on bonus", "won't accept stock-only", deal-breakers, learnings from past negotiations.
              Markdown OK.
            </p>
          </div>
        </div>
      </CollapsibleCard>

      <!-- PREFERENCES -->
      <CollapsibleCard
        title="Hard preferences"
        description="Yes/no filters that become evaluation rules. Must-haves bump matching jobs UP the score; hard-nos bump matching jobs DOWN (or skip them entirely). Be concrete: 'TypeScript-first stack' is a useful must-have because it's checkable from a posting; 'good engineering culture' isn't, because the system can't enforce vibes."
        storageKey="preferences"
      >
        {#snippet icon()}<ShieldAlert class="size-3.5 text-muted-foreground" />{/snippet}
        <div class="space-y-4">
          <div class="space-y-1.5">
            <Label class="text-xs flex items-center gap-2">
              <span class="size-1.5 rounded-full bg-emerald-400"></span>
              Must have
            </Label>
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              Things you require. A posting that doesn't mention any of these gets a small score penalty;
              one that mentions all of them gets a boost. Use checkable tech / process keywords (e.g. "TypeScript", "remote-first").
            </p>
            <ChipListEditor
              items={edit.preferences?.must_have ?? []}
              onchange={(next: string[]) => (edit = { ...edit, preferences: { ...edit.preferences, must_have: next } })}
              placeholder="TypeScript-first stack"
              emptyText="No hard requirements set."
            />
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs flex items-center gap-2">
              <span class="size-1.5 rounded-full bg-blue-400"></span>
              Strong plus
            </Label>
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              Things you'd like but don't require. Light boost when a posting mentions one — useful for tie-breaking
              between otherwise similar jobs.
            </p>
            <ChipListEditor
              items={edit.preferences?.strong_plus ?? []}
              onchange={(next: string[]) => (edit = { ...edit, preferences: { ...edit.preferences, strong_plus: next } })}
              placeholder="Cloudflare Workers"
              emptyText="No nice-to-haves added."
            />
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs flex items-center gap-2">
              <span class="size-1.5 rounded-full bg-red-400"></span>
              Hard no
            </Label>
            <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
              Deal-breakers. A posting that matches a hard-no gets pushed to the bottom of the pipeline and
              flagged with a SKIP recommendation. Use industry / domain / tech filters that are visible in postings.
            </p>
            <ChipListEditor
              items={edit.preferences?.hard_no ?? []}
              onchange={(next: string[]) => (edit = { ...edit, preferences: { ...edit.preferences, hard_no: next } })}
              placeholder="Crypto / Web3"
              emptyText="No deal-breakers set."
            />
          </div>
        </div>
      </CollapsibleCard>

      <!-- LANGUAGE -->
      <CollapsibleCard
        title="Language"
        description={"Pick which mode-template language the dashboard uses for evaluations + interview prep. Defaults to English (top-level modes/). Selecting German / French / Japanese / Portuguese / Russian / Spanish points spawned-CLI flows at modes/<lang>/ — individual files fall back to English when the localized version is missing. The Skills page groups + filters by this language too."}
        storageKey="language"
      >
        {#snippet icon()}<ShieldAlert class="size-3.5 text-muted-foreground" />{/snippet}
        <div class="space-y-2">
          <Label class="text-xs" for="profile-language-modes-dir">Modes directory</Label>
          <select
            id="profile-language-modes-dir"
            class="h-9 w-full rounded-md border border-border/40 bg-card text-xs px-2"
            value={edit.language?.modes_dir ?? ''}
            onchange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              edit = { ...edit, language: { ...edit.language, modes_dir: v } };
            }}
          >
            <option value="">English (modes/) — default</option>
            <option value="modes/de">Deutsch (modes/de)</option>
            <option value="modes/fr">Français (modes/fr)</option>
            <option value="modes/ja">日本語 (modes/ja)</option>
            <option value="modes/pt">Português (modes/pt)</option>
            <option value="modes/ru">Русский (modes/ru)</option>
            <option value="modes/es">Español (modes/es)</option>
          </select>
          <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
            Saved to <code class="font-mono">profile.yml.language.modes_dir</code>. Picked up immediately by
            mock-interview, interview-prep, and negotiation flows; oferta + outreach use it once the symlink
            re-swap on next spawn lands. Missing translations gracefully fall back to English.
          </p>
        </div>
      </CollapsibleCard>

      <!-- AUTONOMOUS APPLY -->
      <!--
        Per-profile opt-in for the autonomous-apply pipeline. When ON:
          - JobActions collapses to a single "Queue apply" button
          - apply-queue-drain picks up Queued jobs and runs the right portal
          - Submit is clicked automatically (LinkedIn / Greenhouse / Ashby)
          - Soft-failures surface as Inbox Issues with "Open posting" CTA
        When OFF (default):
          - The 3-mode dropdown stays (LinkedIn / Open+Mark / Mark)
          - apply-queue-drain skips this profile's queued jobs

        Score gate (min_score_to_apply) prevents auto-submitting borderline
        fits even when autonomous_apply is true. Warmup days clamps the per-
        profile cap to 5/day for the first N days after opt-in — useful for
        LinkedIn shadowban mitigation.
      -->
      <CollapsibleCard
        title="Autonomous apply"
        description="Stage jobs in one click and let the autopilot drain submit them across LinkedIn / Greenhouse / Ashby. Default: OFF. The autopilot stops at the score gate and the daily cap. Soft-failures (CAPTCHA, anti-bot, unknown form field) land in the Inbox with a finish-by-hand CTA."
        storageKey="autonomous-apply"
      >
        {#snippet icon()}<Wand2 class="size-3.5 text-fuchsia-400" />{/snippet}
        <div class="space-y-4">
          <!-- Master toggle -->
          <div class="flex items-start gap-3 rounded-md border border-border/40 bg-card px-3 py-3">
            <input
              type="checkbox"
              id="auto-apply-toggle"
              class="size-4 rounded border-border accent-foreground mt-0.5"
              checked={!!edit.automation?.autonomous_apply}
              onchange={(e) => {
                const v = (e.currentTarget as HTMLInputElement).checked;
                edit = { ...edit, automation: { ...edit.automation, autonomous_apply: v } };
              }}
            />
            <div class="flex-1 min-w-0">
              <Label for="auto-apply-toggle" class="text-sm font-medium cursor-pointer">
                Enable autonomous apply for this profile
              </Label>
              <p class="text-[11px] text-muted-foreground/80 leading-relaxed mt-0.5">
                When ON, the autopilot drain submits applications without per-job confirmation — including
                the final Submit click. Read <a href="/help/autonomous-apply" class="underline underline-offset-2 hover:text-foreground">the risk acknowledgment</a> first.
              </p>
            </div>
          </div>

          <!-- Sub-options (only relevant if autonomous_apply is ON) -->
          <div class={cn(
            'space-y-3 pl-3 ml-2 border-l-2 border-border/30',
            !edit.automation?.autonomous_apply && 'opacity-50',
          )}>
            <!-- Score gate -->
            <div class="space-y-1.5">
              <Label class="text-xs" for="auto-min-score">Minimum score to auto-submit</Label>
              <div class="flex items-center gap-2">
                <input
                  id="auto-min-score"
                  type="range"
                  min="3.0"
                  max="5.0"
                  step="0.1"
                  class="flex-1 accent-foreground"
                  value={edit.automation?.min_score_to_apply ?? 4.0}
                  oninput={(e) => {
                    const v = parseFloat((e.currentTarget as HTMLInputElement).value);
                    edit = { ...edit, automation: { ...edit.automation, min_score_to_apply: v } };
                  }}
                />
                <span class="font-mono text-xs tabular-nums w-10 text-right">
                  {(edit.automation?.min_score_to_apply ?? 4.0).toFixed(1)}
                </span>
              </div>
              <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
                Jobs below this threshold land in <code class="font-mono">ManualApplyNeeded</code> even when autonomous mode is on.
                Default 4.0 — recommended floor.
              </p>
            </div>

            <!-- Warmup days -->
            <div class="space-y-1.5">
              <Label class="text-xs" for="auto-warmup">Warmup window (days)</Label>
              <Input
                id="auto-warmup"
                type="number"
                min="0"
                max="60"
                class="h-9 text-xs w-24"
                value={edit.automation?.warmup_days ?? 7}
                oninput={(e) => {
                  const v = parseInt((e.currentTarget as HTMLInputElement).value, 10);
                  edit = { ...edit, automation: { ...edit.automation, warmup_days: isFinite(v) ? v : 0 } };
                }}
              />
              <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
                For the first N days after enabling, the per-profile cap is clamped to 5/day regardless of the
                global "Max applies / day" setting. Limits LinkedIn shadowban risk while you confirm the
                pipeline behaves as expected.
              </p>
            </div>

            <!-- Enabled portals -->
            <div class="space-y-1.5">
              <Label class="text-xs">Enabled portals</Label>
              <div class="grid grid-cols-2 gap-1.5">
                {#each [
                  { id: 'linkedin', label: 'LinkedIn', supported: true },
                  { id: 'greenhouse', label: 'Greenhouse', supported: true },
                  { id: 'ashby', label: 'Ashby', supported: true },
                  { id: 'lever', label: 'Lever', supported: true },
                  { id: 'workable', label: 'Workable', supported: true },
                  { id: 'personio', label: 'Personio (DACH)', supported: true },
                  { id: 'smartrecruiters', label: 'SmartRecruiters', supported: true },
                  { id: 'recruitee', label: 'Recruitee', supported: true },
                  { id: 'teamtailor', label: 'Teamtailor', supported: true },
                  { id: 'workday', label: 'Workday (heuristic — instance varies)', supported: true },
                  { id: 'indeed', label: 'Indeed (Easy Apply only)', supported: true },
                ] as portal (portal.id)}
                  {@const enabled = (edit.automation?.enabled_portals ?? ['linkedin', 'greenhouse', 'ashby']).includes(portal.id)}
                  <label class="flex items-center gap-2 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      class="size-3.5 rounded border-border accent-foreground"
                      checked={enabled}
                      disabled={!portal.supported}
                      onchange={(e) => {
                        const on = (e.currentTarget as HTMLInputElement).checked;
                        const cur = edit.automation?.enabled_portals ?? ['linkedin', 'greenhouse', 'ashby'];
                        const next = on
                          ? [...new Set([...cur, portal.id])]
                          : cur.filter((p) => p !== portal.id);
                        edit = { ...edit, automation: { ...edit.automation, enabled_portals: next } };
                      }}
                    />
                    <span class={cn(!portal.supported && 'text-muted-foreground/50')}>{portal.label}</span>
                  </label>
                {/each}
              </div>
              <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
                Stub portals route to <code class="font-mono">apply-stub.py</code> which emits a
                <code class="font-mono">ManualApplyNeeded</code> Issue. Production adapters land in future
                releases; the queue stays useful as a "review later" inbox in the meantime.
              </p>
            </div>
          </div>

          <!-- Warning banner -->
          <div class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
            <AlertTriangle class="size-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
            <p class="text-[11px] text-amber-100/90 leading-relaxed">
              Autonomous apply overrides the default "review before Submit" ethical rule via this per-profile
              opt-in. Use only on a profile where you trust the score gate to filter low-fit roles — every
              submission costs a recruiter's time. Read the
              <a href="/help/autonomous-apply" class="underline underline-offset-2 hover:text-foreground">help page</a>
              for risks (LinkedIn shadowban, generic cover-letter quality, selector breakage).
            </p>
          </div>
        </div>
      </CollapsibleCard>

      <!-- FORM-ANSWERS CACHE -->
      <!--
        Reusable per-question answers. Seeded by the user (recommended:
        notice period, salary, visa status, years of X) and auto-grown by
        apply-greenhouse.py / apply-ashby.py via the inline "Save answer"
        action on Inbox apply-issues. The Python adapters read this cache
        before every form fill via lib_apply.load_form_answers().
      -->
      <FormAnswersCard
        profileId={data.profileId}
        initialAnswers={data.formAnswers}
        initialStats={data.formAnswersStats}
      />

      <!-- STORY BANK -->
      <!--
        The story bank is interview-prep/story-bank.md — a SHARED file
        across profiles that holds 5-10 master STAR+R stories. Without
        seeding, every interview-prep run starts cold and re-derives
        stories from the CV ad-hoc. Seeding once produces a curated bank
        the user can edit + grow.
      -->
      <CollapsibleCard
        title="Story bank (interview prep)"
        description="5-10 master STAR+R stories Claude pulls out of your cv.md, used by interview-prep + mock-interview. Seed once, edit by hand to taste, then every future interview-prep run uses these instead of regenerating from scratch."
        storageKey="story-bank"
      >
        {#snippet icon()}<Mic2 class="size-3.5 text-muted-foreground" />{/snippet}
        <div class="space-y-3">
          <div class="rounded-md border border-border/40 bg-card px-3 py-2.5 flex items-center gap-3 flex-wrap">
            <span class="text-xs">
              {#if storyBankStats}
                <span class="font-mono">{storyBankStats.storyCount}</span>
                <span class="text-muted-foreground">{storyBankStats.storyCount === 1 ? 'story' : 'stories'} in bank</span>
              {:else}
                <span class="text-muted-foreground">Loading…</span>
              {/if}
            </span>
            {#if storyBankStats?.lastUpdatedAt}
              <span class="text-[10px] text-muted-foreground/70">
                last updated {new Date(storyBankStats.lastUpdatedAt).toLocaleDateString()}
              </span>
            {/if}
            <div class="flex-1"></div>
            <Button
              onclick={seedStoryBank}
              disabled={seedingStoryBank}
              size="sm"
              class="gap-1.5"
            >
              {#if seedingStoryBank}
                <Loader2 class="size-3 animate-spin" /> Seeding…
              {:else}
                <Sparkles class="size-3" />
                {storyBankStats && storyBankStats.storyCount > 0 ? 'Re-seed from CV' : 'Seed from CV'}
              {/if}
            </Button>
          </div>
          <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
            Reads <code class="font-mono">cv.md</code> + <code class="font-mono">_profile.md</code>
            and appends STAR+R stories to <code class="font-mono">interview-prep/story-bank.md</code>.
            Existing stories aren't overwritten — re-seeding only adds new ones from CV bullets
            that don't already have a story. Edit by hand to refine wording.
            ~30-60s per seed via Claude CLI.
          </p>
        </div>
      </CollapsibleCard>

      <!-- COMPANION FILES -->
      <CollapsibleCard
        title="Companion files"
        description="Files that the system reads alongside the form fields above. cv.md is the authoritative source for every PDF generation — change it and every future tailored CV updates with you. modes/_profile.md holds your background-check policy and language overrides; rarely touched but readable here."
        storageKey="companion-files"
      >
        {#snippet icon()}<FileText class="size-3.5 text-muted-foreground" />{/snippet}
        <div class="space-y-2">
          <!-- ============ CV row — full View / Edit / Replace / Reprocess actions ============ -->
          <div class="flex items-start gap-3 p-3 rounded-md border border-border/40 bg-card/50">
            <FileText class="size-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-medium">CV (cv.md)</span>
                {#if data.profile.files.cv.exists}
                  <Badge variant="outline" class="text-[10px] h-4 px-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                    {(data.profile.files.cv.size / 1024).toFixed(1)} KB
                  </Badge>
                {:else}
                  <Badge variant="outline" class="text-[10px] h-4 px-1 border-amber-500/40 bg-amber-500/10 text-amber-300">missing</Badge>
                {/if}
              </div>
              <p class="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Your canonical CV in plain markdown. Every tailored PDF is generated from this file, every cover-letter
                draft references its experience section, every fit score reads its skills. Edit / View / Replace it here,
                or run <strong>Reprocess</strong> to have Claude re-extract identity + narrative from it into the form fields above.
              </p>
              <code class="text-[10px] font-mono text-muted-foreground/70 mt-1 inline-block">{data.profile.files.cv.path}</code>

              <!-- Action row -->
              <Tooltip.Provider delayDuration={300}>
                <div class="flex items-center gap-1 mt-2.5 flex-wrap">
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          type="button"
                          variant="outline"
                          size="sm"
                          class="h-7 text-xs gap-1.5"
                          onclick={() => openCv('view')}
                          disabled={!data.profile.files.cv.exists}
                        >
                          <Eye class="size-3" /> View
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom" class="text-xs">Read-only rendered markdown · copy or download as .md</Tooltip.Content>
                  </Tooltip.Root>

                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          type="button"
                          variant="outline"
                          size="sm"
                          class="h-7 text-xs gap-1.5"
                          onclick={() => openCv('edit')}
                          disabled={!data.profile.files.cv.exists}
                        >
                          <Pencil class="size-3" /> Edit
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom" class="text-xs">In-place edit · backs up previous version to cv.md.bak before saving</Tooltip.Content>
                  </Tooltip.Root>

                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          type="button"
                          variant="outline"
                          size="sm"
                          class="h-7 text-xs gap-1.5"
                          onclick={() => openCv('replace')}
                        >
                          <ReplaceAll class="size-3" /> {data.profile.files.cv.exists ? 'Replace' : 'Add CV'}
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom" class="text-xs max-w-xs">
                      {data.profile.files.cv.exists
                        ? 'Paste a fresh CV — the current one moves to cv.md.bak first'
                        : 'Paste your CV markdown to create cv.md'}
                    </Tooltip.Content>
                  </Tooltip.Root>

                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          type="button"
                          variant="outline"
                          size="sm"
                          class="h-7 text-xs gap-1.5 border-amber-500/30 hover:bg-amber-500/10"
                          onclick={() => openCv('reprocess')}
                          disabled={!data.profile.files.cv.exists}
                        >
                          <Wand2 class="size-3 text-amber-400" /> Reprocess
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom" class="text-xs max-w-xs">
                      Run Claude over cv.md to extract identity + narrative + location into the profile form. Costs ~$0.10–$0.30. Nothing saves until you click Save Profile.
                    </Tooltip.Content>
                  </Tooltip.Root>

                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          type="button"
                          variant="ghost"
                          size="sm"
                          class="h-7 text-xs gap-1 ml-auto"
                          onclick={() => copyText(data.profile.files.cv.path, 'cv')}
                        >
                          {#if copiedKey === 'cv'}
                            <Check class="size-3 text-emerald-400" /> Copied
                          {:else}
                            <Copy class="size-3" /> Copy path
                          {/if}
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom" class="text-xs">Copy the file path so you can open cv.md in your editor</Tooltip.Content>
                  </Tooltip.Root>
                </div>
              </Tooltip.Provider>
            </div>
          </div>

          <!-- ============ General CV PDF — what LinkedIn Easy Apply uploads ============ -->
          <div class="flex items-start gap-3 p-3 rounded-md border border-border/40 bg-card/50">
            <FileText class="size-4 text-blue-400/80 mt-0.5 flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-medium">General CV PDF (cv-general.pdf)</span>
                {#if generalCv.exists && !generalCv.outdated}
                  <Badge variant="outline" class="text-[10px] h-4 px-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                    {(generalCv.bytes ?? 0) > 0 ? ((generalCv.bytes ?? 0) / 1024).toFixed(1) + ' KB' : 'ready'}
                  </Badge>
                  {#if generalCv.generatedAt}
                    <span class="text-[10px] text-muted-foreground/70">generated {fmtAge(generalCv.generatedAt)}</span>
                  {/if}
                {:else if generalCv.exists && generalCv.outdated}
                  <Badge variant="outline" class="text-[10px] h-4 px-1 border-amber-500/40 bg-amber-500/10 text-amber-300">
                    outdated
                  </Badge>
                  <span class="text-[10px] text-amber-300/80">cv.md was edited after the PDF was generated</span>
                {:else if generalCv.missingSource}
                  <Badge variant="outline" class="text-[10px] h-4 px-1 border-amber-500/40 bg-amber-500/10 text-amber-300">cv.md missing</Badge>
                {:else}
                  <Badge variant="outline" class="text-[10px] h-4 px-1 border-zinc-500/40 bg-zinc-500/10 text-muted-foreground">not generated</Badge>
                {/if}
              </div>

              <p class="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Used by <strong>LinkedIn Easy Apply</strong> only. LinkedIn shows recruiters your
                profile and the uploaded resume <em>side by side</em> — uploading a per-job tailored
                CV here is a known recruiter red flag. So this PDF is built straight from
                <code class="font-mono">cv.md</code> with <em>no</em> per-job rewriting, keeping it
                consistent with your LinkedIn profile. Per-job tailored CVs continue to be used for
                Greenhouse / Ashby / Lever / Workday / etc.
              </p>
              <code class="text-[10px] font-mono text-muted-foreground/70 mt-1 inline-block">{generalCv.path}</code>

              <!-- Action row -->
              <Tooltip.Provider delayDuration={300}>
                <div class="flex items-center gap-1 mt-2.5 flex-wrap">
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          type="button"
                          variant="outline"
                          size="sm"
                          class={cn(
                            'h-7 text-xs gap-1.5',
                            (!generalCv.exists || generalCv.outdated) && 'border-blue-500/40 hover:bg-blue-500/10',
                          )}
                          onclick={generateGeneralCvNow}
                          disabled={generatingGeneralCv || generalCv.missingSource}
                        >
                          {#if generatingGeneralCv}
                            <Loader2 class="size-3 animate-spin text-blue-400" /> Generating…
                          {:else if generalCv.exists && !generalCv.outdated}
                            <Wand2 class="size-3" /> Regenerate
                          {:else}
                            <Wand2 class="size-3 text-blue-400" /> Generate
                          {/if}
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom" class="text-xs max-w-xs">
                      Runs Claude over <code class="font-mono">cv.md</code> + the HTML template, then renders the PDF via headless Chromium. Costs ~$0.30–$0.60. Takes ~15–30s.
                    </Tooltip.Content>
                  </Tooltip.Root>

                  <!-- Refresh status — uses /api/profile/general-cv/status to
                       re-check whether cv.md has changed since the PDF was
                       generated. Cheap (just fs.stat). Useful after editing
                       cv.md in the CV manager without leaving this page. -->
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          type="button"
                          variant="ghost"
                          size="icon"
                          class="h-7 w-7"
                          onclick={refetchGeneralCvStatus}
                          aria-label="Refresh CV status"
                        >
                          <RotateCw class="size-3" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom" class="text-xs max-w-xs">
                      Re-check the PDF's freshness vs <code class="font-mono">cv.md</code> without reloading.
                    </Tooltip.Content>
                  </Tooltip.Root>

                  {#if generalCv.exists}
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <Button
                            {...props}
                            type="button"
                            variant="ghost"
                            size="sm"
                            class="h-7 text-xs gap-1 ml-auto"
                            onclick={() => copyText(generalCv.path, 'general-cv')}
                          >
                            {#if copiedKey === 'general-cv'}
                              <Check class="size-3 text-emerald-400" /> Copied
                            {:else}
                              <Copy class="size-3" /> Copy path
                            {/if}
                          </Button>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content side="bottom" class="text-xs">
                        Copy <code class="font-mono">{generalCv.path}</code> so you can preview the PDF
                      </Tooltip.Content>
                    </Tooltip.Root>
                  {/if}
                </div>
              </Tooltip.Provider>

              {#if generalCv.missingSource}
                <p class="text-[10px] text-amber-300/85 mt-2 leading-relaxed">
                  Add your CV first (use the row above) — the general PDF can't be generated without <code class="font-mono">cv.md</code>.
                </p>
              {:else if !generalCv.exists}
                <p class="text-[10px] text-muted-foreground/80 mt-2 leading-relaxed">
                  Until you generate this, LinkedIn Easy Apply will skip the resume-upload step entirely (LinkedIn falls back to whatever resume you already have on file there, or none).
                </p>
              {/if}
            </div>
          </div>

          <!-- ============ profile.md row — copy-path only for now ============ -->
          <div class="flex items-start gap-3 p-3 rounded-md border border-border/40 bg-card/50">
            <FileCode class="size-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-medium">Background-check policy &amp; narrative overrides (modes/_profile.md)</span>
                {#if data.profile.files.profileMd.exists}
                  <Badge variant="outline" class="text-[10px] h-4 px-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                    {(data.profile.files.profileMd.size / 1024).toFixed(1)} KB
                  </Badge>
                {:else}
                  <Badge variant="outline" class="text-[10px] h-4 px-1 border-amber-500/40 bg-amber-500/10 text-amber-300">missing</Badge>
                {/if}
              </div>
              <p class="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Your overrides for the system layer: background-check disclosure rules, archetype-mapping tweaks,
                language preferences for evaluation reports. The default ships from a template; whatever you put here
                stays here — system updates never overwrite this file. Edit it directly in your editor of choice.
              </p>
              <code class="text-[10px] font-mono text-muted-foreground/70 mt-1 inline-block">{data.profile.files.profileMd.path}</code>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-7 text-xs gap-1 flex-shrink-0"
              onclick={() => copyText(data.profile.files.profileMd.path, 'profileMd')}
            >
              {#if copiedKey === 'profileMd'}
                <Check class="size-3 text-emerald-400" /> Copied
              {:else}
                <Copy class="size-3" /> Copy path
              {/if}
            </Button>
          </div>
        </div>
      </CollapsibleCard>

      <!-- ============ DANGER ZONE ============ -->
      <CollapsibleCard
        title="Danger zone"
        description="Irreversible actions hidden behind a type-to-confirm dialog. Three scopes: profile-only (keeps tracker), jobs-only (keeps profile + targeting + sources), or everything (clean slate). Modified files get .bak backups."
        storageKey="danger-zone"
        defaultOpen={false}
        class="border-red-500/30 bg-red-500/[0.02]"
      >
        {#snippet icon()}<ShieldAlert class="size-3.5 text-red-400/80" />{/snippet}
        <div class="space-y-2">
          <div class="flex items-start gap-3 p-3 rounded-md border border-red-500/30 bg-red-500/5">
            <ShieldAlert class="size-4 text-red-300 mt-0.5 flex-shrink-0" />
            <div class="flex-1 min-w-0 space-y-1.5">
              <div class="text-xs font-medium text-red-200">Reset to scratch</div>
              <p class="text-[11px] text-red-200/80 leading-relaxed">
                Opens a dialog with three destructiveness levels:
              </p>
              <ul class="text-[11px] text-red-200/80 leading-relaxed list-disc list-inside ml-1 space-y-0.5">
                <li>
                  <strong class="text-red-200">Profile only</strong> — wipes <code class="font-mono">profile.yml</code>,
                  <code class="font-mono">cv.md</code>, and <code class="font-mono">modes/_profile.md</code>.
                  Tracker / reports / sources are kept.
                </li>
                <li>
                  <strong class="text-red-200">Jobs data only</strong> — wipes
                  <code class="font-mono">applications.md</code>, <code class="font-mono">pipeline.md</code>,
                  scan history, scores, every report, every tailored CV PDF, follow-ups, interview-prep
                  company files, issues, and the activity feed. <em>Profile, CV, targeting, and connected
                  sources are preserved</em> so you can keep working.
                </li>
                <li>
                  <strong class="text-red-200">Everything</strong> — strict superset of the above,
                  plus saved filter profiles, autopilot schedule, and the story bank. Closest thing
                  to a clean slate.
                </li>
              </ul>
              <p class="text-[11px] text-red-200/70 leading-relaxed">
                All modes back up modified files to <code class="font-mono">.bak</code> first.
                <code class="font-mono">.env</code> / API keys / Python <code class="font-mono">.venv</code> /
                Playwright sessions / <code class="font-mono">portals.yml</code> are never touched by Profile-only
                or Jobs-only resets.
                You'll have to type <code class="font-mono text-red-200">RESET</code> in the dialog to enable the button.
              </p>
            </div>
            <div class="flex flex-col gap-1.5 flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-7 text-xs gap-1.5 border-orange-500/40 text-orange-300 hover:bg-orange-500/15 hover:text-orange-200"
                onclick={() => { resetInitialScope = 'jobs'; resetOpen = true; }}
              >
                <Briefcase class="size-3" /> Clear jobs…
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-7 text-xs gap-1.5 border-red-500/40 text-red-300 hover:bg-red-500/15 hover:text-red-200"
                onclick={() => { resetInitialScope = 'profile'; resetOpen = true; }}
              >
                <Trash2 class="size-3" /> Reset…
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleCard>

      <!-- CV manager sheet + Reset dialog — open via buttons above -->
      <CvManagerSheet bind:open={cvOpen} initialTab={cvInitialTab} onApplySuggestion={applyCvSuggestion} />
      <ResetProfileDialog bind:open={resetOpen} initialScope={resetInitialScope} profileId={data.profileId} />
    </div>
  </div>

  <!-- Sticky save bar (rendered inside scroll container so it floats above content) -->
  {#if dirty}
    <div class="sticky bottom-0 z-20 border-t bg-card/95 backdrop-blur-md">
      <div class="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
        <AlertCircle class="size-4 text-amber-300" />
        <span class="text-xs text-amber-200 flex-1">Unsaved changes to your profile</span>
        <!-- Shared destructive-button component (ConfirmButton) — same
             red-armed double-click pattern as every other destructive
             action across the app. -->
        <ConfirmButton
          variant="ghost"
          size="sm"
          idleLabel="Discard"
          confirmVerb="discard"
          disabled={saving}
          onconfirm={discardImmediate}
        />
        <Button size="sm" onclick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </div>
  {/if}
</div>
