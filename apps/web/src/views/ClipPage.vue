<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch, ApiFetchError } from '@/lib/api';
import { user, authLoading, fetchCurrentUser } from '@/composables/useAuth';
import { useStream } from '@/composables/useStream';
import { renderMarkdown } from '@/lib/markdown';

type ClipData = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  visibility: string;
  thumbnailKey: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  showClipper: boolean;
  showClipperAvatar: boolean;
  clipperName: string | null;
  clipperAvatarUrl: string | null;
};

type ClipState = 'loading' | 'found' | 'unauthorized' | 'not-found';

const route = useRoute();
const { streamState, initStream } = useStream();

const clipId = computed(() => route.params.id as string);
const clip = ref<ClipData | null>(null);
const clipState = ref<ClipState>('loading');
const isModalMode = ref(false);

const downloadUrl = computed(() => `/api/clips/${clipId.value}/download`);

const ctaText = computed(() =>
  streamState.value === 'live' ? 'Watch Live' : 'Go to Stream',
);

onMounted(async () => {
  // Detect modal mode — clip was opened via pushState from the stream page
  if (window.history.state?.clipModal === true && window.history.state?.fromRoute === '/') {
    isModalMode.value = true;
    return;
  }

  // Ensure auth state is resolved before determining CTA visibility
  await fetchCurrentUser();

  try {
    const data = await apiFetch<ClipData>(`/api/clips/${clipId.value}`);
    clip.value = data;
    clipState.value = 'found';

    // Fetch stream state for authenticated users to power the CTA
    if (user.value) {
      await initStream();
    }
  } catch (err) {
    if (err instanceof ApiFetchError && err.status === 401) {
      clipState.value = 'unauthorized';
    } else {
      clipState.value = 'not-found';
    }
  }
});
</script>

<template>
  <!-- Modal mode: defer rendering to Story 10-5 modal overlay system -->
  <div v-if="isModalMode" />

  <!-- Loading state -->
  <div
    v-else-if="clipState === 'loading'"
    class="flex items-center justify-center h-dvh bg-[hsl(var(--background))]"
    data-testid="clip-loading"
  >
    <svg
      class="h-8 w-8 animate-spin text-white/40"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  </div>

  <!-- Unauthenticated + shared clip: prompt sign in -->
  <main
    v-else-if="clipState === 'unauthorized'"
    class="flex min-h-dvh items-center justify-center bg-[hsl(var(--background))]"
    data-testid="clip-unauthorized"
  >
    <div class="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card p-10 text-center shadow-lg">
      <h1 class="text-xl font-semibold text-foreground">Sign in to view this clip</h1>
      <p class="text-sm text-muted-foreground">This clip is only available to signed-in users.</p>
      <a
        href="/api/auth/google"
        class="flex w-full items-center justify-center gap-3 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-[#3c4043] shadow-sm transition-shadow hover:shadow-md"
      >
        Sign in with Google
      </a>
    </div>
  </main>

  <!-- Missing or private clip: not found -->
  <main
    v-else-if="clipState === 'not-found'"
    class="flex min-h-dvh items-center justify-center bg-[hsl(var(--background))]"
    data-testid="clip-not-found"
  >
    <div class="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card p-10 text-center shadow-lg">
      <h1 class="text-xl font-semibold text-foreground">Clip not found</h1>
      <p class="text-sm text-muted-foreground">This clip may have been removed or made private.</p>
    </div>
  </main>

  <!-- Clip found: full standalone page -->
  <main
    v-else-if="clipState === 'found' && clip"
    class="min-h-dvh bg-[hsl(var(--background))] text-foreground [@media(orientation:landscape)_and_(max-height:500px)]:h-dvh [@media(orientation:landscape)_and_(max-height:500px)]:overflow-hidden"
    data-testid="clip-page"
  >
    <div class="mx-auto max-w-5xl px-4 py-6 flex flex-col gap-6 [@media(orientation:landscape)_and_(max-height:500px)]:flex-row [@media(orientation:landscape)_and_(max-height:500px)]:max-w-none [@media(orientation:landscape)_and_(max-height:500px)]:p-0 [@media(orientation:landscape)_and_(max-height:500px)]:gap-0 [@media(orientation:landscape)_and_(max-height:500px)]:h-full">
      <!-- Video player — full width on portrait/desktop, full height on mobile landscape -->
      <video
        :src="downloadUrl"
        controls
        class="w-full rounded-lg bg-black [@media(orientation:landscape)_and_(max-height:500px)]:h-full [@media(orientation:landscape)_and_(max-height:500px)]:w-auto [@media(orientation:landscape)_and_(max-height:500px)]:rounded-none [@media(orientation:landscape)_and_(max-height:500px)]:flex-shrink-0"
        data-testid="clip-video"
      />

      <!-- Right column (mobile landscape) / below (portrait/desktop): metadata + actions -->
      <div class="flex flex-col gap-4 [@media(orientation:landscape)_and_(max-height:500px)]:flex-1 [@media(orientation:landscape)_and_(max-height:500px)]:overflow-y-auto [@media(orientation:landscape)_and_(max-height:500px)]:p-4 [@media(orientation:landscape)_and_(max-height:500px)]:min-w-0">
        <!-- Clip metadata -->
        <div class="flex flex-col gap-2">
          <h1 class="text-xl font-semibold leading-snug" data-testid="clip-name">{{ clip.name }}</h1>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            v-if="clip.description"
            class="prose prose-sm prose-invert max-w-none text-muted-foreground"
            data-testid="clip-description"
            v-html="renderMarkdown(clip.description)"
          />
        </div>

        <!-- Clipper attribution -->
        <div
          v-if="clip.showClipper"
          class="flex items-center gap-3"
          data-testid="clip-attribution"
        >
          <img
            v-if="clip.showClipperAvatar && clip.clipperAvatarUrl"
            :src="clip.clipperAvatarUrl"
            :alt="clip.clipperName ?? 'Clipper avatar'"
            class="h-8 w-8 rounded-full object-cover"
            data-testid="clip-clipper-avatar"
          />
          <span class="text-sm text-muted-foreground" data-testid="clip-clipper-name">
            {{ clip.clipperName }}
          </span>
        </div>

        <!-- Actions row -->
        <div class="flex items-center gap-3 flex-wrap">
          <!-- Download button (all users) -->
          <a
            :href="downloadUrl"
            download
            class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            data-testid="clip-download"
          >
            Download
          </a>

          <!-- Stream CTA — authenticated users only -->
          <template v-if="!authLoading && user">
            <a
              href="/"
              class="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              data-testid="clip-stream-cta"
            >
              {{ ctaText }}
            </a>
          </template>
        </div>
      </div>
    </div>
  </main>
</template>
