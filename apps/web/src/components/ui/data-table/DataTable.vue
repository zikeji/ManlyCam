<script setup lang="ts" generic="TData, TValue">
import type { ColumnDef, SortingState } from '@tanstack/vue-table';
import {
  useVueTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  FlexRender,
} from '@tanstack/vue-table';
import { ref, computed } from 'vue';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-vue-next';

interface Props {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  emptyMessage?: string;
  hasMore?: boolean;
  initialSorting?: SortingState;
}

const props = withDefaults(defineProps<Props>(), {
  pageSize: 10,
  emptyMessage: 'No data.',
  hasMore: false,
  initialSorting: () => [],
});

const emit = defineEmits<{ loadMore: [] }>();

const sorting = ref<SortingState>(props.initialSorting);

const table = useVueTable({
  get data() {
    return props.data;
  },
  get columns() {
    return props.columns;
  },
  state: {
    get sorting() {
      return sorting.value;
    },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater;
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  initialState: {
    pagination: {
      pageSize: props.pageSize,
    },
  },
});

const isOnLastPage = computed(() => !table.getCanNextPage());

defineExpose({ table });
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex-1 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <TableHead
              v-for="header in headerGroup.headers"
              :key="header.id"
              :class="header.column.getCanSort() ? 'cursor-pointer select-none' : ''"
              @click="header.column.getCanSort() ? header.column.toggleSorting() : undefined"
            >
              <template v-if="!header.isPlaceholder">
                <div class="flex items-center gap-1">
                  <FlexRender
                    :render="header.column.columnDef.header"
                    :props="header.getContext()"
                  />
                  <template v-if="header.column.getCanSort()">
                    <ChevronUp v-if="header.column.getIsSorted() === 'asc'" class="w-3 h-3" />
                    <ChevronDown
                      v-else-if="header.column.getIsSorted() === 'desc'"
                      class="w-3 h-3"
                    />
                    <ChevronsUpDown v-else class="w-3 h-3 text-muted-foreground" />
                  </template>
                </div>
              </template>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="table.getRowModel().rows.length">
            <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
              <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
              </TableCell>
            </TableRow>
          </template>
          <TableRow v-else>
            <TableCell :colspan="columns.length" class="h-24 text-center text-muted-foreground">
              {{ emptyMessage }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <div class="flex items-center justify-between px-2 py-3 border-t border-border shrink-0">
      <div class="text-sm text-muted-foreground">
        Page {{ table.getState().pagination.pageIndex + 1 }} of
        {{ Math.max(table.getPageCount(), 1) }}
      </div>
      <div class="flex items-center gap-2">
        <Button
          v-if="isOnLastPage && hasMore"
          variant="outline"
          size="sm"
          @click="emit('loadMore')"
        >
          Load more
        </Button>
        <Button
          variant="outline"
          size="icon"
          class="w-8 h-8"
          :disabled="!table.getCanPreviousPage()"
          @click="table.previousPage()"
        >
          <ChevronLeft class="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          class="w-8 h-8"
          :disabled="!table.getCanNextPage()"
          @click="table.nextPage()"
        >
          <ChevronRight class="w-4 h-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
