<script setup lang="ts">
import { ref, computed } from 'vue';
import { toast } from 'vue-sonner';
import { Trash2, Plus, Globe, Mail, Info } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAdminAllowlist } from '@/composables/useAdminAllowlist';

// Keep in sync with allowlistService.ts EMAIL_REGEX / DOMAIN_REGEX
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

const { entries, isLoading, error, addEntry, removeEntry } = useAdminAllowlist();

const domainInput = ref('');
const emailInput = ref('');
const domainError = ref('');
const emailError = ref('');
const domainAdding = ref(false);
const emailAdding = ref(false);
const removingIds = ref<Set<string>>(new Set());

const domains = computed(() => entries.value.filter((e) => e.type === 'domain'));
const emails = computed(() => entries.value.filter((e) => e.type === 'email'));

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

async function handleAddDomain() {
  const value = domainInput.value.trim();
  if (!value) {
    domainError.value = 'Please enter a domain.';
    return;
  }
  if (!DOMAIN_REGEX.test(value)) {
    domainError.value = 'Invalid domain format (e.g. example.com).';
    return;
  }
  domainError.value = '';
  domainAdding.value = true;
  try {
    const result = await addEntry('domain', value);
    if (result.alreadyExists) {
      toast('Already in allowlist', { description: 'This entry already exists and is active.' });
    }
    domainInput.value = '';
  } catch {
    domainError.value = 'Failed to add domain. Please try again.';
  } finally {
    domainAdding.value = false;
  }
}

async function handleAddEmail() {
  const value = emailInput.value.trim().toLowerCase();
  if (!value) {
    emailError.value = 'Please enter an email address.';
    return;
  }
  if (!EMAIL_REGEX.test(value)) {
    emailError.value = 'Invalid email format (e.g. user@example.com).';
    return;
  }
  emailError.value = '';
  emailAdding.value = true;
  try {
    const result = await addEntry('email', value);
    if (result.alreadyExists) {
      toast('Already in allowlist', { description: 'This entry already exists and is active.' });
    }
    emailInput.value = '';
  } catch {
    emailError.value = 'Failed to add email. Please try again.';
  } finally {
    emailAdding.value = false;
  }
}

async function handleRemove(id: string) {
  removingIds.value = new Set([...removingIds.value, id]);
  try {
    await removeEntry(id);
  } catch {
    // removeEntry shows a toast on error; swallow here to prevent unhandled rejection
  } finally {
    removingIds.value = new Set([...removingIds.value].filter((x) => x !== id));
  }
}

function onDomainKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') handleAddDomain();
}

function onEmailKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') handleAddEmail();
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <ScrollArea class="flex-1">
      <div class="p-6 space-y-8">
        <!-- Loading / Error state -->
        <div v-if="isLoading" class="flex items-center justify-center py-8 text-muted-foreground text-sm">
          Loading allowlist…
        </div>
        <div v-else-if="error" class="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">
          {{ error }}
        </div>

        <template v-else>
          <!-- Domains Section -->
          <section>
            <div class="flex items-center gap-2 mb-3">
              <Globe class="w-4 h-4 text-muted-foreground" />
              <h3 class="text-sm font-semibold">Domains</h3>
              <Badge variant="secondary" class="ml-auto">{{ domains.length }}</Badge>
            </div>

            <!-- Add domain input -->
            <div class="flex gap-2 mb-1">
              <input
                v-model="domainInput"
                type="text"
                placeholder="example.com"
                class="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                :disabled="domainAdding"
                @keydown="onDomainKeydown"
              />
              <Button size="sm" :disabled="domainAdding" @click="handleAddDomain">
                <Plus class="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
            <p v-if="domainError" class="text-xs text-destructive mb-2">{{ domainError }}</p>

            <!-- Domain list -->
            <div v-if="domains.length === 0" class="text-sm text-muted-foreground py-3 text-center">
              No domains added yet.
            </div>
            <ul v-else class="space-y-1 mt-2">
              <li
                v-for="entry in domains"
                :key="entry.id"
                class="flex items-center gap-3 rounded-md px-3 py-2 text-sm bg-muted/40 hover:bg-muted/70 transition-colors group"
              >
                <span class="flex-1 font-mono truncate">{{ entry.value }}</span>
                <span class="text-xs text-muted-foreground shrink-0">{{ formatDate(entry.createdAt) }}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  :disabled="removingIds.has(entry.id)"
                  @click="handleRemove(entry.id)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                  <span class="sr-only">Remove {{ entry.value }}</span>
                </Button>
              </li>
            </ul>
          </section>

          <!-- Emails Section -->
          <section>
            <div class="flex items-center gap-2 mb-3">
              <Mail class="w-4 h-4 text-muted-foreground" />
              <h3 class="text-sm font-semibold">Email Addresses</h3>
              <Badge variant="secondary" class="ml-auto">{{ emails.length }}</Badge>
            </div>

            <!-- Add email input -->
            <div class="flex gap-2 mb-1">
              <input
                v-model="emailInput"
                type="email"
                placeholder="user@example.com"
                class="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                :disabled="emailAdding"
                @keydown="onEmailKeydown"
              />
              <Button size="sm" :disabled="emailAdding" @click="handleAddEmail">
                <Plus class="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
            <p v-if="emailError" class="text-xs text-destructive mb-2">{{ emailError }}</p>

            <!-- Email list -->
            <div v-if="emails.length === 0" class="text-sm text-muted-foreground py-3 text-center">
              No email addresses added yet.
            </div>
            <ul v-else class="space-y-1 mt-2">
              <li
                v-for="entry in emails"
                :key="entry.id"
                class="flex items-center gap-3 rounded-md px-3 py-2 text-sm bg-muted/40 hover:bg-muted/70 transition-colors group"
              >
                <span class="flex-1 font-mono truncate">{{ entry.value }}</span>
                <span class="text-xs text-muted-foreground shrink-0">{{ formatDate(entry.createdAt) }}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  :disabled="removingIds.has(entry.id)"
                  @click="handleRemove(entry.id)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                  <span class="sr-only">Remove {{ entry.value }}</span>
                </Button>
              </li>
            </ul>
          </section>
        </template>
      </div>
    </ScrollArea>

    <!-- Informational note (sticky footer) -->
    <div class="shrink-0 border-t border-border px-6 py-3 flex items-start gap-2 bg-muted/20">
      <Info class="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <p class="text-xs text-muted-foreground">
        Removing an entry does not revoke active sessions — it only affects future sign-ins.
      </p>
    </div>
  </div>
</template>
