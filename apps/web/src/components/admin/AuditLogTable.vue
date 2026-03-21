<script setup lang="ts">
import { onMounted, h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { useAuditLog } from '@/composables/useAuditLog';
import type { AuditLogEntry } from '@/composables/useAuditLog';
import { formatDateTime } from '@/lib/dateFormat';
import { Loader2 } from 'lucide-vue-next';

const ACTION_LABELS: Record<string, string> = {
  message_delete: 'Message Deleted',
  mute: 'User Muted',
  unmute: 'User Unmuted',
  ban: 'User Banned',
  unban: 'User Unbanned',
  reaction_remove: 'Reaction Removed',
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
  },
  {
    accessorKey: 'targetId',
    header: 'Target',
    cell: ({ row }) => {
      const targetId = row.getValue<string | null>('targetId');
      return targetId ?? '—';
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
    sortingFn: 'datetime',
  },
  {
    accessorKey: 'metadata',
    header: 'Metadata',
    cell: ({ row }) => {
      const metadata = row.getValue<unknown>('metadata');
      if (metadata === null || metadata === undefined) return '—';
      const str = JSON.stringify(metadata);
      return str.length > 80 ? str.slice(0, 80) + '…' : str;
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
      @load-more="fetchNextPage"
    />
  </div>
</template>
