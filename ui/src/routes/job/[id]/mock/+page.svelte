<!--
  Voice mock interview page.

  Browser uses Web Speech API:
    - SpeechRecognition (STT) to capture spoken answers
    - speechSynthesis (TTS) to speak the interviewer's questions

  Per-turn:
    1. TTS speaks the question
    2. STT listens for the user's answer (with manual end-turn button)
    3. POST /api/job/[id]/mock-turn with history + answer
    4. Get back next-question + score for that answer
    5. TTS speaks the new question

  Session ends when the user clicks "End session." The server saves the
  full transcript to interview-prep/{slug}-mock-{stage}-{ts}.md.

  Browser support: SpeechRecognition requires Chrome/Edge (or any
  Chromium-based browser). On Firefox/Safari the page falls back to
  text-input. We detect that on mount and toggle the UI.
-->
<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import {
    Mic,
    MicOff,
    Volume2,
    VolumeX,
    Play,
    StopCircle,
    Loader2,
    MessageSquare,
    ArrowLeft,
    AlertCircle,
    CheckCircle2,
    FileText,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { onMount, onDestroy } from 'svelte';
  import { cn } from '$lib/utils';
  import type { Job } from '$lib/types';

  let { data }: { data: { job: Job; profileId: string } } = $props();

  type Stage = 'PhoneScreen' | 'Technical' | 'TakeHome' | 'Onsite' | 'Final';
  type Turn = {
    question: string;
    answer: string;
    score?: number | null;
    feedback?: string;
    audioUrl?: string;
  };

  // MediaRecorder state -- capture the user's audio per turn so they can
  // replay themselves and HEAR what they sound like. Browser-side only;
  // never uploaded. Blob URLs are revoked on session end / unmount.
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let mediaChunks: Blob[] = [];
  let recording = $state(false);
  let recordingSupported = $state(false);
  let currentAudioUrl = $state<string | undefined>(undefined);
  // Track every blob URL we create so we can revoke them on unmount.
  let blobUrlsToRevoke: string[] = [];

  let stage = $state<Stage>('PhoneScreen');
  // Panel mode (#10) -- auto-enables when stage is Onsite, since that's
  // the typical panel format. User can also force it on for other stages.
  let panelMode = $state(false);
  $effect(() => {
    if (stage === 'Onsite') panelMode = true;
  });
  let history = $state<Turn[]>([]);
  let currentQuestion = $state<string>('');
  let currentAnswer = $state<string>('');
  let lastFeedback = $state<string | undefined>(undefined);
  let lastScore = $state<number | null>(null);

  // Recognition + synthesis state.
  let recognitionSupported = $state(false);
  let synthesisSupported = $state(false);
  let listening = $state(false);
  let speaking = $state(false);
  let muted = $state(false);
  let recognition: any = null;
  let sessionActive = $state(false);
  let waitingForServer = $state(false);

  // Session metadata.
  let startedAt = $state<number>(0);
  let endedTranscriptPath = $state<string | undefined>(undefined);
  let endedSummary = $state<string | undefined>(undefined);

  onMount(() => {
    if (typeof window !== 'undefined') {
      const SR =
        (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
          .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
      recognitionSupported = !!SR;
      synthesisSupported = 'speechSynthesis' in window;
      // MediaRecorder check -- capturing audio for playback.
      recordingSupported = 'MediaRecorder' in window && !!navigator.mediaDevices;
      if (recognitionSupported) {
        // @ts-expect-error - vendor-specific class
        recognition = new SR();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.onresult = (event: any) => {
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) final += transcript;
            else interim += transcript;
          }
          if (final) currentAnswer = (currentAnswer + ' ' + final).trim();
          // For interim, append visually; but don't persist until final.
          if (interim) {
            // Show interim by suffixing temporarily -- when next final arrives
            // it overwrites with the final version of those words.
          }
        };
        recognition.onerror = (e: any) => {
          listening = false;
          if (e?.error !== 'no-speech') {
            toast.warning('Speech recognition error', { description: e?.error ?? 'unknown' });
          }
        };
        recognition.onend = () => {
          listening = false;
        };
      }
    }
  });

  onDestroy(() => {
    try {
      recognition?.abort();
    } catch {}
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    // Stop + release mic + revoke every Blob URL we ever created so the
    // browser doesn't leak memory across long sessions.
    try {
      mediaRecorder?.stop();
    } catch {}
    if (mediaStream) {
      for (const t of mediaStream.getTracks()) {
        try {
          t.stop();
        } catch {}
      }
      mediaStream = null;
    }
    const allUrls = [...blobUrlsToRevoke];
    if (currentAudioUrl) allUrls.push(currentAudioUrl);
    for (const t of history) if (t.audioUrl) allUrls.push(t.audioUrl);
    for (const u of allUrls) {
      try {
        URL.revokeObjectURL(u);
      } catch {}
    }
  });

  function speak(text: string) {
    if (muted || !synthesisSupported) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.onstart = () => {
        speaking = true;
      };
      u.onend = () => {
        speaking = false;
      };
      u.onerror = () => {
        speaking = false;
      };
      window.speechSynthesis.speak(u);
    } catch {
      /* silent */
    }
  }

  /** Acquire mic (once per session). Returns true if we got it. */
  async function ensureMicStream(): Promise<boolean> {
    if (!recordingSupported) return false;
    if (mediaStream) return true;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch {
      // User denied or no mic. Recognition still works via the existing
      // Web Speech path even without recording.
      recordingSupported = false;
      return false;
    }
  }

  /** Start capturing audio for this turn. Chunks land in mediaChunks;
   *  on stop we build a single Blob URL the user can play back. */
  async function startRecording() {
    if (recording) return;
    if (!(await ensureMicStream())) return;
    try {
      mediaChunks = [];
      mediaRecorder = new MediaRecorder(mediaStream!);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) mediaChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        if (mediaChunks.length === 0) return;
        const blob = new Blob(mediaChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        // Replace prior turn-in-progress audio. Old URLs get queued for
        // revoke on unmount (we keep them addressable for the history list).
        if (currentAudioUrl) blobUrlsToRevoke.push(currentAudioUrl);
        currentAudioUrl = url;
      };
      mediaRecorder.start();
      recording = true;
    } catch {
      recording = false;
    }
  }

  function stopRecording() {
    if (!recording || !mediaRecorder) return;
    try {
      mediaRecorder.stop();
    } catch {}
    recording = false;
  }

  async function startListening() {
    if (!recognition || listening) return;
    try {
      recognition.start();
      listening = true;
      // Also begin recording so the user can replay their own audio.
      await startRecording();
    } catch {
      /* already-started errors */
    }
  }
  function stopListening() {
    if (!recognition || !listening) return;
    try {
      recognition.stop();
    } catch {}
    stopRecording();
    listening = false;
  }

  /** Begin a fresh session. */
  async function beginSession() {
    if (sessionActive) return;
    history = [];
    currentAnswer = '';
    currentQuestion = '';
    lastFeedback = undefined;
    lastScore = null;
    endedTranscriptPath = undefined;
    endedSummary = undefined;
    startedAt = Date.now();
    sessionActive = true;
    await advanceTurn(''); // empty latestAnswer → server treats as first turn
  }

  /** Send the user's latest answer + receive the next question. */
  async function advanceTurn(latestAnswer: string) {
    if (!data.job?.id) return;
    waitingForServer = true;
    stopListening();
    try {
      const r = await api.post<{
        ok: boolean;
        score?: number | null;
        feedback?: string;
        nextQuestion?: string;
        questionRationale?: string;
        error?: string;
      }>(
        '/api/job/' +
          encodeURIComponent(data.job.id) +
          '/mock-turn?profile=' +
          encodeURIComponent(data.profileId),
        {
          stage,
          history,
          latestAnswer,
          endSession: false,
          startedAt,
          panelMode,
        },
        { silent: true },
      );
      if (!r.ok) {
        toast.error('Turn failed', { description: r.error ?? 'unknown' });
        return;
      }
      // Persist the previous turn (if there was one) with its score +
      // any captured audio. The audio Blob URL stays addressable for the
      // life of the page; cleanup happens on onDestroy.
      if (currentQuestion && latestAnswer) {
        history = [
          ...history,
          {
            question: currentQuestion,
            answer: latestAnswer,
            score: r.score ?? null,
            feedback: r.feedback,
            audioUrl: currentAudioUrl,
          },
        ];
      }
      // Reset the per-turn audio pointer so the next turn captures fresh.
      currentAudioUrl = undefined;
      lastScore = r.score ?? null;
      lastFeedback = r.feedback;
      currentQuestion = r.nextQuestion ?? '';
      currentAnswer = '';
      if (currentQuestion) speak(currentQuestion);
    } catch (e) {
      const err = e as ApiError;
      toast.error('Turn failed', { description: err.message });
    } finally {
      waitingForServer = false;
    }
  }

  async function submitAnswer() {
    if (!currentAnswer.trim() || waitingForServer) return;
    await advanceTurn(currentAnswer);
  }

  async function endSession() {
    if (!sessionActive || !data.job?.id) return;
    stopListening();
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    waitingForServer = true;
    try {
      // If there's an in-flight answer, count it.
      const lastAnswer = currentAnswer.trim();
      const finalHistory =
        lastAnswer && currentQuestion
          ? [...history, { question: currentQuestion, answer: lastAnswer, score: null }]
          : history;
      const r = await api.post<{
        ok: boolean;
        endSession?: boolean;
        transcriptPath?: string;
        summary?: string;
        error?: string;
      }>(
        '/api/job/' +
          encodeURIComponent(data.job.id) +
          '/mock-turn?profile=' +
          encodeURIComponent(data.profileId),
        {
          stage,
          history: finalHistory,
          latestAnswer: '',
          endSession: true,
          startedAt,
          panelMode,
        },
        { silent: true },
      );
      if (r.ok) {
        endedTranscriptPath = r.transcriptPath;
        endedSummary = r.summary;
        toast.success('Session ended', {
          description: 'Transcript saved to ' + (r.transcriptPath ?? ''),
          duration: 10_000,
        });
      } else {
        toast.error('Could not end session', { description: r.error ?? 'unknown' });
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('Could not end session', { description: err.message });
    } finally {
      sessionActive = false;
      waitingForServer = false;
    }
  }

  let stageOptions: Array<{ id: Stage; label: string; blurb: string }> = [
    { id: 'PhoneScreen', label: 'Phone screen', blurb: 'Recruiter / HR · soft, logistics, fit' },
    { id: 'Technical', label: 'Technical', blurb: 'Live coding / system design / API design' },
    { id: 'TakeHome', label: 'Take-home retro', blurb: 'Walk through tradeoffs' },
    { id: 'Onsite', label: 'Onsite / panel', blurb: 'Mixed: behavioral + technical + collab' },
    { id: 'Final', label: 'Final / exec', blurb: 'Hiring committee, VP, big-picture' },
  ];
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="Mock interview · {data.job?.role ?? 'Job'}"
    subtitle={data.job?.company}
    showTabs={false}
    breadcrumb="Job"
    breadcrumbHref={'/job/' + (data.job?.id ?? '')}
  />

  <div class="p-6 pb-24">
    <div class="max-w-3xl mx-auto space-y-5">
      <!-- Hero -->
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <div
            class="size-10 rounded-lg bg-orange-500/10 ring-1 ring-orange-500/40 flex items-center justify-center"
          >
            <Mic class="size-5 text-orange-400" />
          </div>
          <h1 class="text-2xl font-semibold tracking-tight">Mock interview drill</h1>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">
          Voice-driven drill: Claude plays the interviewer, speaks each question, and listens to
          your spoken answer. Each turn is scored 1-5 with one-sentence feedback so you can iterate.
          Transcript + summary save to <code class="font-mono text-[11px]">interview-prep/</code>
          on session end.
        </p>
      </div>

      <!-- Browser support -->
      {#if !recognitionSupported || !synthesisSupported}
        <div
          class="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 flex items-start gap-2"
        >
          <AlertCircle class="size-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div class="text-xs text-amber-200/90 leading-relaxed">
            {#if !recognitionSupported}
              <p>
                <strong>Speech recognition not supported.</strong> Chrome / Edge / Brave have it; Firefox
                + Safari don't. You can still type answers manually below.
              </p>
            {/if}
            {#if !synthesisSupported}
              <p>Speech synthesis also not supported. Questions will be text-only.</p>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Stage selector -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-sm">Stage</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-2">
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {#each stageOptions as opt}
              <button
                type="button"
                onclick={() => {
                  if (!sessionActive) stage = opt.id;
                }}
                class={cn(
                  'rounded-md border px-2.5 py-2 text-left transition',
                  stage === opt.id
                    ? 'border-orange-500/60 bg-orange-500/10 text-orange-100'
                    : 'border-border/40 bg-card hover:border-border',
                  sessionActive && stage !== opt.id && 'opacity-40 cursor-not-allowed',
                )}
                disabled={sessionActive && stage !== opt.id}
              >
                <div class="text-xs font-medium">{opt.label}</div>
                <div class="text-[11px] text-muted-foreground/80 leading-tight">{opt.blurb}</div>
              </button>
            {/each}
          </div>

          <!-- Panel mode (#10) — rotate personas (EM → peer → cross-fn →
               bar-raiser). Auto-enables on Onsite stage; user can force
               on/off for other stages. -->
          <div class="flex items-center gap-2 pt-2 border-t border-border/30">
            <input
              type="checkbox"
              id="panel-mode"
              checked={panelMode}
              onchange={(e) => {
                if (!sessionActive) panelMode = (e.currentTarget as HTMLInputElement).checked;
              }}
              disabled={sessionActive}
              class="size-3.5 rounded border-border accent-foreground"
            />
            <label for="panel-mode" class="text-xs cursor-pointer">
              Panel mode — rotate personas (EM → peer eng → cross-fn → bar-raiser)
            </label>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Session controls -->
      <div class="flex items-center gap-2 flex-wrap">
        {#if !sessionActive}
          <Button onclick={beginSession} disabled={waitingForServer} class="gap-1.5">
            {#if waitingForServer}<Loader2 class="size-3.5 animate-spin" />{:else}<Play
                class="size-3.5"
              />{/if}
            Start session · {stage}
          </Button>
        {:else}
          <Button
            onclick={endSession}
            variant="destructive"
            disabled={waitingForServer}
            class="gap-1.5"
          >
            <StopCircle class="size-3.5" /> End session
          </Button>
          <Button onclick={() => (muted = !muted)} variant="ghost" size="sm" class="gap-1.5">
            {#if muted}<VolumeX class="size-3.5" />{:else}<Volume2 class="size-3.5" />{/if}
            {muted ? 'Unmute' : 'Mute TTS'}
          </Button>
        {/if}
      </div>

      <!-- Current question -->
      {#if sessionActive && currentQuestion}
        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Title class="text-sm flex items-center gap-2">
              <MessageSquare class="size-4 text-orange-400" />
              Question {history.length + 1}
              {#if speaking}<span class="text-[11px] text-orange-300 animate-pulse">speaking…</span
                >{/if}
            </Card.Title>
          </Card.Header>
          <Card.Content class="space-y-3">
            <p class="text-sm leading-relaxed">{currentQuestion}</p>

            <div class="space-y-1.5">
              <Label class="text-xs"
                >Your answer ({listening ? 'listening — speak now' : 'type or click Speak'})</Label
              >
              <Textarea
                bind:value={currentAnswer}
                rows={4}
                placeholder="Speak your answer or type here…"
                class="text-sm"
              />
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              {#if recognitionSupported}
                {#if listening}
                  <Button onclick={stopListening} variant="outline" size="sm" class="gap-1.5">
                    <MicOff class="size-3.5 text-red-300" /> Stop listening
                  </Button>
                {:else}
                  <Button onclick={startListening} variant="outline" size="sm" class="gap-1.5">
                    <Mic class="size-3.5 text-emerald-300" /> Speak
                  </Button>
                {/if}
              {/if}
              <Button
                onclick={submitAnswer}
                disabled={!currentAnswer.trim() || waitingForServer}
                class="gap-1.5"
              >
                {#if waitingForServer}
                  <Loader2 class="size-3.5 animate-spin" /> Scoring…
                {:else}
                  Submit answer →
                {/if}
              </Button>
            </div>

            {#if lastFeedback}
              <div
                class="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs space-y-1"
              >
                <div class="flex items-center gap-2">
                  <span class="text-muted-foreground">Last turn:</span>
                  {#if lastScore != null}
                    <span
                      class={cn(
                        'font-mono px-1.5 py-0.5 rounded border text-[11px]',
                        lastScore >= 4
                          ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                          : lastScore >= 3
                            ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                            : 'border-red-500/40 text-red-300 bg-red-500/10',
                      )}
                    >
                      {lastScore}/5
                    </span>
                  {/if}
                </div>
                <p class="text-muted-foreground/80 leading-relaxed">{lastFeedback}</p>
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- History -->
      {#if history.length > 0}
        <Card.Root>
          <Card.Header class="pb-2">
            <Card.Title class="text-sm">Session so far · {history.length} turns</Card.Title>
          </Card.Header>
          <Card.Content class="space-y-2">
            {#each history as t, i (i)}
              <div class="rounded-md border border-border/40 bg-card px-3 py-2 space-y-1">
                <div class="text-xs font-medium flex items-center gap-2">
                  Q{i + 1}: <span class="font-normal">{t.question}</span>
                </div>
                <p class="text-[11px] text-muted-foreground/80 italic leading-relaxed">
                  "{t.answer.slice(0, 200)}"
                </p>
                <!--
                  Voice playback (#1) — hear yourself. Counting "uh"s and
                  "kind of"s is a different kind of feedback from the
                  text-only score. <audio> is small + native, no extra
                  controls component needed.
                -->
                {#if t.audioUrl}
                  <div class="pt-1">
                    <audio controls src={t.audioUrl} class="h-6 w-full max-w-xs"></audio>
                  </div>
                {/if}
                {#if t.score != null || t.feedback}
                  <div class="flex items-start gap-2 text-[11px]">
                    {#if t.score != null}
                      <span
                        class={cn(
                          'font-mono px-1 py-0.5 rounded border',
                          t.score >= 4
                            ? 'border-emerald-500/40 text-emerald-300'
                            : t.score >= 3
                              ? 'border-amber-500/40 text-amber-300'
                              : 'border-red-500/40 text-red-300',
                        )}
                      >
                        {t.score}/5
                      </span>
                    {/if}
                    {#if t.feedback}
                      <span class="text-muted-foreground">{t.feedback}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Session summary on end -->
      {#if endedSummary}
        <Card.Root class="border-emerald-500/40 bg-emerald-500/5">
          <Card.Header class="pb-2">
            <Card.Title class="text-base flex items-center gap-2">
              <CheckCircle2 class="size-4 text-emerald-300" />
              Session summary
            </Card.Title>
          </Card.Header>
          <Card.Content class="space-y-2">
            <article
              class="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-sans text-sm"
            >
              {endedSummary}
            </article>
            {#if endedTranscriptPath}
              <p
                class="text-[11px] text-muted-foreground/70 font-mono pt-2 border-t border-border/30"
              >
                Saved to {endedTranscriptPath}
              </p>
            {/if}
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Back link -->
      <div class="pt-2">
        <Button
          variant="ghost"
          size="sm"
          href={'/job/' + (data.job?.id ?? '')}
          class="text-xs gap-1"
        >
          <ArrowLeft class="size-3" /> Back to job
        </Button>
      </div>
    </div>
  </div>
</div>
