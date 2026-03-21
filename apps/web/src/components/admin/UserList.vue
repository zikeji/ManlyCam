<script setup lang="ts">
import { ref } from 'vue';
import {
  ColorAreaRoot,
  ColorAreaArea,
  ColorAreaThumb,
  ColorSliderRoot,
  ColorSliderTrack,
  ColorSliderThumb,
  ColorFieldRoot,
  ColorFieldInput,
  ColorSwatchPickerRoot,
  ColorSwatchPickerItem,
  ColorSwatchPickerItemSwatch,
  ColorSwatchPickerItemIndicator,
  parseColor,
  colorToHex,
} from 'reka-ui';
import type { Color } from 'reka-ui';
import { useAdminUsers } from '@/composables/useAdminUsers';
import { useAuth } from '@/composables/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown } from 'lucide-vue-next';
import { Role, SYSTEM_USER_ID } from '@manlycam/types';
import { USER_TAG_PALETTE } from '@/lib/userTagPalette';
import type { AdminUser } from '@/composables/useAdminUsers';

const { users, isLoading, error, updateRole, updateUserTag, clearUserTag } = useAdminUsers();
const { user: currentUser } = useAuth();

// Per-row tag editor state keyed by user ID
const tagPopoverOpen = ref<Record<string, boolean>>({});
const tagTextInput = ref<Record<string, string>>({});
const tagColorObj = ref<Record<string, Color>>({});

/* c8 ignore start -- color parsing/conversion helpers; catch blocks handle malformed color strings from external ColorPicker */
function safeParseColor(hex: string): Color {
  try {
    return parseColor(hex);
  } catch {
    return parseColor(USER_TAG_PALETTE[0]);
  }
}

function getColorHex(userId: string): string {
  const c = tagColorObj.value[userId];
  if (!c) return USER_TAG_PALETTE[0];
  try {
    return colorToHex(c);
  } catch {
    return USER_TAG_PALETTE[0];
  }
}

function getSwatchValue(userId: string): string {
  const hex = getColorHex(userId);
  return (USER_TAG_PALETTE as readonly string[]).includes(hex) ? hex : '';
}

function setTagColor(userId: string, value: Color | string | null | undefined) {
  if (!value) return;
  if (typeof value === 'string') {
    tagColorObj.value[userId] = safeParseColor(value);
  } else {
    tagColorObj.value[userId] = value;
  }
}

function onSwatchChange(userId: string, value: unknown) {
  if (typeof value === 'string' && value) {
    tagColorObj.value[userId] = safeParseColor(value);
  }
}
/* c8 ignore stop */

const getRoleBadgeVariant = (role: Role) => {
  switch (role) {
    case Role.Admin:
      return 'destructive';
    case Role.Moderator:
      return 'default';
    case Role.ViewerCompany:
      return 'outline';
    case Role.ViewerGuest:
      return 'secondary';
    /* c8 ignore next 2 -- TypeScript enum exhaustive; default unreachable */
    default:
      return 'secondary';
  }
};

const getRoleBadgeClass = (role: Role) => {
  switch (role) {
    case Role.Admin:
      return 'bg-red-900/50 text-red-200 border-red-700 hover:bg-red-900/50';
    case Role.Moderator:
      return 'bg-blue-900/50 text-blue-200 border-blue-700 hover:bg-blue-900/50';
    case Role.ViewerCompany:
      return 'bg-orange-900/50 text-orange-200 border-orange-700 hover:bg-orange-900/50';
    case Role.ViewerGuest:
      return 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-800';
    /* c8 ignore next 2 -- TypeScript enum exhaustive; default unreachable */
    default:
      return '';
  }
};

const canChangeRole = (user: AdminUser) => {
  return (
    user.id !== currentUser.value?.id && user.role !== Role.Admin && user.id !== SYSTEM_USER_ID
  );
};

const ROLES_OPTIONS = [Role.Moderator, Role.ViewerCompany, Role.ViewerGuest];

async function handleRoleChange(user: AdminUser, newRole: string) {
  if (user.role === newRole) return;
  try {
    await updateRole(user.id, newRole as Role);
  } catch {
    // Error handled in updateRole
  }
}

function openTagPopover(user: AdminUser) {
  tagTextInput.value[user.id] = user.userTagText ?? '';
  tagColorObj.value[user.id] = safeParseColor(user.userTagColor ?? USER_TAG_PALETTE[0]);
  tagPopoverOpen.value[user.id] = true;
}

function closeTagPopover(userId: string) {
  tagPopoverOpen.value[userId] = false;
}

function resetTagState(userId: string) {
  tagTextInput.value[userId] = '';
  tagColorObj.value[userId] = safeParseColor(USER_TAG_PALETTE[0]);
}

async function handleSaveTag(userId: string) {
  const text = (tagTextInput.value[userId] ?? '').trim();
  const hex = getColorHex(userId);
  try {
    if (text) {
      await updateUserTag(userId, text, hex);
    } else {
      resetTagState(userId);
      await clearUserTag(userId);
    }
    closeTagPopover(userId);
  } catch {
    // Error logged in composable
  }
}

async function handleClearTag(userId: string) {
  resetTagState(userId); // immediate visual feedback
  try {
    await clearUserTag(userId);
    closeTagPopover(userId);
  } catch {
    // Error logged in composable
  }
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <div v-if="isLoading && users.length === 0" class="flex-1 flex items-center justify-center">
      <span class="text-sm text-muted-foreground animate-pulse">Loading users...</span>
    </div>
    <div v-else-if="error" class="flex-1 flex items-center justify-center p-4 text-center">
      <span class="text-sm text-destructive">{{ error }}</span>
    </div>
    <ScrollArea v-else class="flex-1">
      <div class="min-w-full inline-block align-middle">
        <table class="min-w-full border-collapse">
          <thead>
            <tr class="border-b border-border text-left">
              <th
                class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                User
              </th>
              <th
                class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Role
              </th>
              <th
                class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id"
              class="border-b border-border/50 hover:bg-accent/50 transition-colors"
            >
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span class="text-sm font-medium text-foreground">{{ user.displayName }}</span>
                  <span class="text-xs text-muted-foreground">{{ user.email }}</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <Badge
                  :variant="getRoleBadgeVariant(user.role)"
                  :class="getRoleBadgeClass(user.role)"
                >
                  {{ user.role }}
                </Badge>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <!-- Set Tag Popover -->
                  <Popover
                    :open="tagPopoverOpen[user.id] ?? false"
                    @update:open="
                      (val) => {
                        if (!val) closeTagPopover(user.id);
                      }
                    "
                  >
                    <PopoverTrigger as-child>
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-7 px-2 text-[10px] gap-1"
                        data-testid="set-tag-btn"
                        @click="openTagPopover(user)"
                      >
                        <span
                          v-if="user.userTagText && user.userTagColor"
                          class="w-2 h-2 rounded-full inline-block flex-shrink-0"
                          :style="{ backgroundColor: user.userTagColor }"
                        />
                        Set Tag
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-72 p-3 space-y-3" align="end">
                      <!-- v-if ensures color components remount fresh each open, avoiding passive-mode lock -->
                      <template v-if="tagPopoverOpen[user.id]">
                        <!-- Tag text -->
                        <div class="space-y-1">
                          <label class="text-xs font-medium text-muted-foreground">Tag text</label>
                          <input
                            v-model="tagTextInput[user.id]"
                            maxlength="20"
                            placeholder="Tag text…"
                            class="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            data-testid="tag-text-input"
                          />
                        </div>

                        <!-- Color picker -->
                        <div class="space-y-2">
                          <label class="text-xs font-medium text-muted-foreground">Color</label>

                          <!-- Color Field (hex input with color swatch icon) -->
                          <ColorFieldRoot
                            :model-value="tagColorObj[user.id]"
                            @update:model-value="(c) => setTagColor(user.id, c)"
                            class="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background"
                            data-testid="color-field"
                          >
                            <span
                              class="w-4 h-4 rounded-sm flex-shrink-0"
                              :style="{ backgroundColor: getColorHex(user.id) }"
                            />
                            <ColorFieldInput
                              class="flex-1 text-xs bg-transparent text-foreground focus:outline-none min-w-0"
                              data-testid="color-field-input"
                            />
                          </ColorFieldRoot>

                          <!-- Color Area (sat/brightness) -->
                          <!-- Wrapper owns positioning context since ColorAreaRoot drops fallthrough attrs -->
                          <div
                            class="relative w-full rounded overflow-hidden"
                            style="height: 120px"
                            data-testid="color-area"
                          >
                            <ColorAreaRoot
                              v-slot="{ style: areaStyle }"
                              :model-value="tagColorObj[user.id]"
                              @update:model-value="(c) => setTagColor(user.id, c)"
                              class="touch-none select-none"
                            >
                              <ColorAreaArea :style="areaStyle" class="absolute inset-0 rounded" />
                              <ColorAreaThumb
                                class="absolute w-4 h-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)] -translate-x-1/2 -translate-y-1/2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-grab active:cursor-grabbing"
                              />
                            </ColorAreaRoot>
                          </div>

                          <!-- Hue slider -->
                          <ColorSliderRoot
                            :model-value="tagColorObj[user.id]"
                            @update:model-value="(c) => setTagColor(user.id, c)"
                            channel="hue"
                            class="relative flex items-center w-full touch-none select-none"
                            style="height: 12px"
                            data-testid="hue-slider"
                          >
                            <ColorSliderTrack
                              class="relative h-3 w-full rounded-full overflow-hidden"
                            />
                            <ColorSliderThumb
                              class="block w-4 h-4 rounded-full border-2 border-white shadow-md focus:outline-none cursor-grab active:cursor-grabbing"
                            />
                          </ColorSliderRoot>

                          <!-- Preset swatches -->
                          <ColorSwatchPickerRoot
                            :model-value="getSwatchValue(user.id)"
                            @update:model-value="(v) => onSwatchChange(user.id, v)"
                            class="grid grid-cols-6 gap-1"
                            data-testid="swatch-picker"
                          >
                            <ColorSwatchPickerItem
                              v-for="color in USER_TAG_PALETTE"
                              :key="color"
                              :value="color"
                              class="relative w-6 h-6 rounded cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                              <ColorSwatchPickerItemSwatch
                                class="w-full h-full rounded"
                                style="background: var(--reka-color-swatch-color)"
                              />
                              <ColorSwatchPickerItemIndicator
                                class="absolute inset-0 flex items-center justify-center pointer-events-none"
                              >
                                <span class="w-2 h-2 rounded-full bg-white shadow-sm" />
                              </ColorSwatchPickerItemIndicator>
                            </ColorSwatchPickerItem>
                          </ColorSwatchPickerRoot>
                        </div>

                        <!-- Actions -->
                        <div class="flex gap-1.5">
                          <Button
                            size="sm"
                            class="flex-1 h-7 text-[10px]"
                            data-testid="save-tag-btn"
                            @click="handleSaveTag(user.id)"
                          >
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            class="flex-1 h-7 text-[10px]"
                            data-testid="clear-tag-btn"
                            @click="handleClearTag(user.id)"
                          >
                            Clear
                          </Button>
                        </div>
                      </template>
                    </PopoverContent>
                  </Popover>

                  <!-- Change Role -->
                  <DropdownMenu v-if="canChangeRole(user)">
                    <DropdownMenuTrigger as-child>
                      <Button variant="outline" size="sm" class="h-7 px-2 text-[10px] gap-1">
                        Change Role
                        <ChevronDown class="w-3 h-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuRadioGroup
                        :model-value="user.role"
                        @update:model-value="(val) => handleRoleChange(user, val as string)"
                      >
                        <DropdownMenuRadioItem
                          v-for="role in ROLES_OPTIONS"
                          :key="role"
                          :value="role"
                          class="text-xs"
                        >
                          {{ role }}
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span
                    v-else-if="user.id === currentUser?.id"
                    class="text-[10px] text-muted-foreground italic"
                    >You</span
                  >
                  <span
                    v-else-if="user.role === Role.Admin"
                    class="text-[10px] text-muted-foreground italic"
                    >System Admin</span
                  >
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </ScrollArea>
  </div>
</template>
