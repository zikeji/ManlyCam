<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { createColumnHelper } from '@tanstack/vue-table';
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
import { DataTable } from '@/components/ui/data-table';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RefreshCw, MoreHorizontal } from 'lucide-vue-next';
import { Role, SYSTEM_USER_ID } from '@manlycam/types';
import { useAdminUsers } from '@/composables/useAdminUsers';
import { useAuth } from '@/composables/useAuth';
import { USER_TAG_PALETTE } from '@/lib/userTagPalette';
import { formatDateTime } from '@/lib/dateFormat';
import type { AdminUser } from '@/composables/useAdminUsers';

const {
  users,
  isLoading,
  error,
  fetchUsers,
  banUserById,
  unbanUserById,
  updateRole,
  updateUserTag,
  clearUserTag,
} = useAdminUsers();
const { user: currentUser } = useAuth();

onMounted(() => {
  if (users.value.length === 0) fetchUsers();
});

const showBanned = ref(false);
const filteredUsers = computed(() =>
  showBanned.value ? users.value : users.value.filter((u) => !u.bannedAt),
);

// Ban confirmation state
const confirmBanOpen = ref(false);
const pendingBanUser = ref<AdminUser | null>(null);

function openBanConfirm(user: AdminUser) {
  pendingBanUser.value = user;
  confirmBanOpen.value = true;
}

async function confirmBan() {
  if (pendingBanUser.value) {
    await banUserById(pendingBanUser.value.id);
    pendingBanUser.value = null;
  }
  confirmBanOpen.value = false;
}

// Tag editor state (per-row, keyed by user ID)
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
  resetTagState(userId);
  try {
    await clearUserTag(userId);
    closeTagPopover(userId);
  } catch {
    // Error logged in composable
  }
}

// Role badge helpers (preserve exact logic from prior version)
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

const canModerate = (user: AdminUser) =>
  user.id !== currentUser.value?.id && user.role !== Role.Admin && user.id !== SYSTEM_USER_ID;

const ROLES_OPTIONS = [Role.Moderator, Role.ViewerCompany, Role.ViewerGuest];

async function handleRoleChange(userId: string, newRole: string) {
  const user = users.value.find((u) => u.id === userId);
  if (user && user.role === (newRole as Role)) return;
  try {
    await updateRole(userId, newRole as Role);
  } catch {
    // Error handled in updateRole
  }
}

// TanStack Table column definitions
const columnHelper = createColumnHelper<AdminUser>();

const columns: ColumnDef<AdminUser>[] = [
  columnHelper.display({
    id: 'user',
    header: 'User',
    enableSorting: false,
    cell: ({ row }) => {
      const user = row.original;
      return h('div', { class: 'flex items-center gap-2' }, [
        h(Avatar, { class: 'w-7 h-7 shrink-0' }, () => [
          h(AvatarImage, { src: user.avatarUrl ?? '' }),
          h(AvatarFallback, { class: 'text-xs' }, () =>
            user.displayName[0]?.toUpperCase() ?? '?',
          ),
        ]),
        h('span', { class: 'text-sm font-medium' }, user.displayName),
      ]);
    },
  }),
  columnHelper.accessor('email', {
    header: 'Email',
    enableSorting: false,
    cell: ({ row }) =>
      h('span', { class: 'text-sm text-muted-foreground' }, row.original.email),
  }) as unknown as ColumnDef<AdminUser>,
  columnHelper.accessor('role', {
    header: 'Role',
    enableSorting: true,
    cell: ({ row }) => {
      const role = row.original.role;
      return h(Badge, { variant: getRoleBadgeVariant(role), class: getRoleBadgeClass(role) }, () =>
        role,
      );
    },
  }) as unknown as ColumnDef<AdminUser>,
  columnHelper.display({
    id: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => {
      const user = row.original;
      if (user.bannedAt) return h('span', { class: 'text-xs text-destructive' }, 'Banned');
      if (user.mutedAt) return h('span', { class: 'text-xs text-yellow-400' }, 'Muted');
      return h('span', { class: 'text-xs text-green-400' }, 'Active');
    },
  }),
  columnHelper.accessor('lastSeenAt', {
    header: 'Last Seen',
    enableSorting: true,
    cell: ({ row }) => {
      const val = row.original.lastSeenAt;
      return h(
        'span',
        { class: 'text-xs text-muted-foreground' },
        val ? formatDateTime(val) : 'Never',
      );
    },
  }) as unknown as ColumnDef<AdminUser>,
  columnHelper.display({
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => {
      const user = row.original;

      // Tag editor popover (dedicated row button preserved from prior implementation)
      const tagPopover = h(
        Popover,
        {
          open: tagPopoverOpen.value[user.id] ?? false,
          'onUpdate:open': (val: boolean) => {
            if (!val) closeTagPopover(user.id);
          },
        },
        {
          default: () => [
            h(PopoverTrigger, { asChild: true }, () =>
              h(
                Button,
                {
                  variant: 'outline',
                  size: 'sm',
                  class: 'h-7 px-2 text-[10px] gap-1',
                  'data-testid': 'set-tag-btn',
                  onClick: () => openTagPopover(user),
                },
                () => [
                  user.userTagText && user.userTagColor
                    ? h('span', {
                        class: 'w-2 h-2 rounded-full inline-block flex-shrink-0',
                        style: { backgroundColor: user.userTagColor },
                      })
                    : null,
                  'Set Tag',
                ],
              ),
            ),
            h(
              PopoverContent,
              { class: 'w-72 p-3 space-y-3', align: 'end' },
              () =>
                tagPopoverOpen.value[user.id]
                  ? h('div', { class: 'space-y-3' }, [
                      h('div', { class: 'space-y-1' }, [
                        h(
                          'label',
                          { class: 'text-xs font-medium text-muted-foreground' },
                          'Tag text',
                        ),
                        h('input', {
                          value: tagTextInput.value[user.id] ?? '',
                          maxlength: 20,
                          placeholder: 'Tag text…',
                          class: 'w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
                          'data-testid': 'tag-text-input',
                          onInput: (e: Event) => {
                            tagTextInput.value[user.id] = (
                              e.target as HTMLInputElement
                            ).value;
                          },
                        }),
                      ]),
                      h('div', { class: 'space-y-2' }, [
                        h(
                          'label',
                          { class: 'text-xs font-medium text-muted-foreground' },
                          'Color',
                        ),
                        h(
                          ColorFieldRoot,
                          {
                            modelValue: tagColorObj.value[user.id],
                            'onUpdate:modelValue': (c: Color | string) => setTagColor(user.id, c as Color),
                            class: 'flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background',
                            'data-testid': 'color-field',
                          },
                          () => [
                            h('span', {
                              class: 'w-4 h-4 rounded-sm flex-shrink-0',
                              style: { backgroundColor: getColorHex(user.id) },
                            }),
                            h(ColorFieldInput, {
                              class: 'flex-1 text-xs bg-transparent text-foreground focus:outline-none min-w-0',
                              'data-testid': 'color-field-input',
                            }),
                          ],
                        ),
                        h(
                          'div',
                          {
                            class: 'relative w-full rounded overflow-hidden',
                            style: 'height: 120px',
                            'data-testid': 'color-area',
                          },
                          [
                            h(
                              ColorAreaRoot,
                              {
                                modelValue: tagColorObj.value[user.id],
                                'onUpdate:modelValue': (c: Color | string) => setTagColor(user.id, c as Color),
                                class: 'touch-none select-none',
                              },
                              {
                                default: ({
                                  style: areaStyle,
                                }: {
                                  style?: Record<string, string>;
                                }) => [
                                  h(ColorAreaArea, {
                                    style: areaStyle,
                                    class: 'absolute inset-0 rounded',
                                  }),
                                  h(ColorAreaThumb, {
                                    class: 'absolute w-4 h-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)] -translate-x-1/2 -translate-y-1/2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-grab active:cursor-grabbing',
                                  }),
                                ],
                              },
                            ),
                          ],
                        ),
                        h(
                          ColorSliderRoot,
                          {
                            modelValue: tagColorObj.value[user.id],
                            'onUpdate:modelValue': (c: Color | string) => setTagColor(user.id, c as Color),
                            channel: 'hue',
                            class: 'relative flex items-center w-full touch-none select-none',
                            style: 'height: 12px',
                            'data-testid': 'hue-slider',
                          },
                          () => [
                            h(ColorSliderTrack, {
                              class: 'relative h-3 w-full rounded-full overflow-hidden',
                            }),
                            h(ColorSliderThumb, {
                              class: 'block w-4 h-4 rounded-full border-2 border-white shadow-md focus:outline-none cursor-grab active:cursor-grabbing',
                            }),
                          ],
                        ),
                        h(
                          ColorSwatchPickerRoot,
                          {
                            modelValue: getSwatchValue(user.id),
                            'onUpdate:modelValue': (v: unknown) => onSwatchChange(user.id, v),
                            class: 'grid grid-cols-6 gap-1',
                            'data-testid': 'swatch-picker',
                          },
                          () =>
                            USER_TAG_PALETTE.map((color) =>
                              h(
                                ColorSwatchPickerItem,
                                {
                                  key: color,
                                  value: color,
                                  class: 'relative w-6 h-6 rounded cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
                                },
                                () => [
                                  h(ColorSwatchPickerItemSwatch, {
                                    class: 'w-full h-full rounded',
                                    style: 'background: var(--reka-color-swatch-color)',
                                  }),
                                  h(
                                    ColorSwatchPickerItemIndicator,
                                    {
                                      class: 'absolute inset-0 flex items-center justify-center pointer-events-none',
                                    },
                                    () => h('span', { class: 'w-2 h-2 rounded-full bg-white shadow-sm' }),
                                  ),
                                ],
                              ),
                            ),
                        ),
                      ]),
                      h('div', { class: 'flex gap-1.5' }, [
                        h(
                          Button,
                          {
                            size: 'sm',
                            class: 'flex-1 h-7 text-[10px]',
                            'data-testid': 'save-tag-btn',
                            onClick: () => handleSaveTag(user.id),
                          },
                          () => 'Save',
                        ),
                        h(
                          Button,
                          {
                            variant: 'outline',
                            size: 'sm',
                            class: 'flex-1 h-7 text-[10px]',
                            'data-testid': 'clear-tag-btn',
                            onClick: () => handleClearTag(user.id),
                          },
                          () => 'Clear',
                        ),
                      ]),
                    ])
                  : null,
            ),
          ],
        },
      );

      // Non-moderatable users: show tag button + label only
      if (!canModerate(user)) {
        return h('div', { class: 'flex items-center justify-end gap-1.5' }, [
          tagPopover,
          user.id === currentUser.value?.id
            ? h('span', { class: 'text-[10px] text-muted-foreground italic' }, 'You')
            : user.role === Role.Admin
              ? h('span', { class: 'text-[10px] text-muted-foreground italic' }, 'System Admin')
              : null,
        ]);
      }

      // Actions dropdown: Ban/Unban + Change Role
      const actionsMenu = h(
        DropdownMenu,
        null,
        {
          default: () => [
            h(DropdownMenuTrigger, { asChild: true }, () =>
              h(
                Button,
                {
                  variant: 'ghost',
                  size: 'sm',
                  class: 'h-7 w-7 p-0',
                  'data-testid': `actions-trigger-${user.id}`,
                },
                () => h(MoreHorizontal, { class: 'w-4 h-4' }),
              ),
            ),
            h(DropdownMenuContent, { align: 'end' }, () => [
              !user.bannedAt
                ? h(
                    DropdownMenuItem,
                    {
                      class: 'text-destructive focus:text-destructive cursor-pointer',
                      'data-testid': `action-ban-${user.id}`,
                      onClick: () => openBanConfirm(user),
                    },
                    () => 'Ban',
                  )
                : h(
                    DropdownMenuItem,
                    {
                      class: 'cursor-pointer',
                      'data-testid': `action-unban-${user.id}`,
                      onClick: () => unbanUserById(user.id),
                    },
                    () => 'Unban',
                  ),
              h(DropdownMenuSeparator),
              h(
                DropdownMenuSub,
                null,
                {
                  default: () => [
                    h(DropdownMenuSubTrigger, null, () => 'Change Role'),
                    h(DropdownMenuSubContent, null, () =>
                      h(
                        DropdownMenuRadioGroup,
                        {
                          modelValue: user.role,
                          'onUpdate:modelValue': (val: unknown) =>
                            handleRoleChange(user.id, val as string),
                        },
                        () =>
                          ROLES_OPTIONS.map((role) =>
                            h(
                              DropdownMenuRadioItem,
                              { key: role, value: role, class: 'text-xs' },
                              () => role,
                            ),
                          ),
                      ),
                    ),
                  ],
                },
              ),
            ]),
          ],
        },
      );

      return h('div', { class: 'flex items-center justify-end gap-1.5' }, [tagPopover, actionsMenu]);
    },
  }),
];
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Toolbar: Show banned toggle + Refresh button -->
    <div class="flex items-center justify-between px-2 py-2 border-b border-border shrink-0">
      <div class="flex items-center gap-2">
        <Switch v-model="showBanned" data-testid="show-banned-toggle" />
        <span class="text-xs text-muted-foreground">Show banned users</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        class="h-7 px-2 gap-1 text-xs"
        data-testid="refresh-btn"
        @click="fetchUsers"
      >
        <RefreshCw class="w-3 h-3" />
        Refresh
      </Button>
    </div>

    <!-- Skeleton loader while initial fetch -->
    <div
      v-if="isLoading && users.length === 0"
      class="flex-1 p-4 space-y-2"
      data-testid="skeleton-loader"
    >
      <div
        v-for="i in 5"
        :key="i"
        class="h-10 w-full rounded bg-accent/50 animate-pulse"
      />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center p-4 text-center">
      <span class="text-sm text-destructive">{{ error }}</span>
    </div>

    <!-- Data table -->
    <div v-else class="flex-1 overflow-hidden" data-testid="users-table-wrapper">
      <DataTable
        :columns="columns"
        :data="filteredUsers"
        :page-size="20"
        empty-message="No users found."
      />
    </div>

    <!-- Ban confirmation dialog (rendered at component level, outside table) -->
    <AlertDialog :open="confirmBanOpen" @update:open="confirmBanOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ban {{ pendingBanUser?.displayName }}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately revoke their sessions. They will not be able to access until
            unbanned.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="confirm-ban-btn"
            @click="confirmBan"
          >
            Ban
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
