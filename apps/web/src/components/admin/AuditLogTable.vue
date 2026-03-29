<script setup lang="ts">
import { onMounted, h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuditLog } from '@/composables/useAuditLog';
import type { AuditLogEntry } from '@/composables/useAuditLog';
import { formatDateTime } from '@/lib/dateFormat';
import { Loader2, Info } from 'lucide-vue-next';

const initialSorting = [{ id: 'performedAt', desc: true as const }];

const ACTION_LABELS: Record<string, string> = {
  message_delete: 'Message Deleted',
  mute: 'User Muted',
  unmute: 'User Unmuted',
  ban: 'User Banned',
  unban: 'User Unbanned',
  reaction_remove: 'Reaction Removed',
  stream_start: 'Stream Started',
  stream_stop: 'Stream Stopped',
  offline_message_update: 'Offline Message Updated',
  camera_settings_update: 'Camera Settings Updated',
};

const { entries, isLoading, hasMore, fetchInitial, fetchNextPage } = useAuditLog();

onMounted(() => {
  fetchInitial();
});

const columns: ColumnDef<AuditLogEntry>[] = [
  {
    accessorKey: 'action',
    header: 'Action',
    cell: ({ row }) => {
      const action = row.getValue<string>('action');
      const label = ACTION_LABELS[action] ?? action;
      return h(Badge, { variant: 'secondary', class: 'whitespace-nowrap' }, () => label);
    },
  },
  {
    accessorKey: 'actorDisplayName',
    header: 'Actor',
    enableSorting: true,
    cell: ({ row }) => {
      const entry = row.original;
      return h('div', { class: 'flex items-center gap-2' }, [
        h(Avatar, { class: 'h-6 w-6 shrink-0' }, () => [
          h(AvatarImage, { src: entry.actorAvatarUrl ?? '' }),
          h(
            AvatarFallback,
            { class: 'text-xs' },
            () => entry.actorDisplayName[0]?.toUpperCase() ?? '?',
          ),
        ]),
        h('span', { class: 'text-sm' }, entry.actorDisplayName),
      ]);
    },
  },
  {
    accessorKey: 'targetId',
    header: 'Target',
    cell: ({ row }) => {
      const entry = row.original;
      if (entry.targetDisplayName) {
        return h('div', { class: 'flex items-center gap-2' }, [
          h(Avatar, { class: 'h-6 w-6 shrink-0' }, () => [
            h(AvatarImage, { src: entry.targetAvatarUrl ?? '' }),
            h(
              AvatarFallback,
              { class: 'text-xs' },
              () => entry.targetDisplayName![0]?.toUpperCase() ?? '?',
            ),
          ]),
          h('span', { class: 'text-sm' }, entry.targetDisplayName),
        ]);
      }
      if (entry.targetId) {
        return h(
          'span',
          { class: 'text-xs text-muted-foreground font-mono' },
          entry.targetId.slice(0, 8) + '\u2026',
        );
      }
      return '\u2014';
    },
    enableSorting: false,
  },
  {
    accessorKey: 'performedAt',
    header: 'Timestamp',
    cell: ({ row }) => {
      return formatDateTime(row.getValue<string>('performedAt'));
    },
    enableSorting: true,
  },
  {
    accessorKey: 'metadata',
    header: 'Metadata',
    cell: ({ row }) => {
      const metadata = row.getValue<unknown>('metadata');
      if (metadata === null || metadata === undefined) return '\u2014';
      const metaObj = metadata as Record<string, unknown>;
      const metaEntries = Object.entries(metaObj);
      return h(Popover, null, {
        default: () => [
          h(PopoverTrigger, { asChild: true }, () =>
            h(
              'button',
              {
                class:
                  'inline-flex items-center justify-center rounded-md p-1 hover:bg-muted transition-colors',
                'data-testid': 'metadata-trigger',
              },
              [h(Info, { class: 'h-4 w-4 text-muted-foreground' })],
            ),
          ),
          h(PopoverContent, { class: 'w-64 p-3', align: 'end' }, () =>
            h(
              'dl',
              { class: 'space-y-1 text-sm' },
              metaEntries.map(([key, value]) =>
                h('div', { class: 'flex justify-between gap-2', key }, [
                  h('dt', { class: 'font-medium text-muted-foreground' }, key),
                  h('dd', { class: 'text-right truncate max-w-[140px]' }, String(value)),
                ]),
              ),
            ),
          ),
        ],
      });
    },
    enableSorting: false,
  },
];
</script>

<template>
  <div class="flex flex-col h-full">
    <div v-if="isLoading && entries.length === 0" class="flex items-center justify-center h-full">
      <Loader2 class="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
    <DataTable
      v-else
      :columns="columns"
      :data="entries"
      :page-size="50"
      empty-message="No moderation actions recorded yet."
      :has-more="hasMore"
      :initial-sorting="initialSorting"
      @load-more="fetchNextPage"
    />
  </div>
</template>
