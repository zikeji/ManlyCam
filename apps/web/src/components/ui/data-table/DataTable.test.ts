import { describe, it, expect, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import DataTable from './DataTable.vue';

interface Row {
  id: string;
  name: string;
}

// VTU doesn't infer generic params from component props, so type as unknown to satisfy mount() signature
const columns: ColumnDef<unknown, unknown>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name', enableSorting: true },
];

const makeData = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `r${i + 1}`, name: `Row ${i + 1}` }));

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('DataTable', () => {
  it('renders column headers', () => {
    wrapper = mount(DataTable, { props: { columns, data: makeData(2) } });
    expect(wrapper.text()).toContain('ID');
    expect(wrapper.text()).toContain('Name');
  });

  it('renders row data', () => {
    wrapper = mount(DataTable, { props: { columns, data: [{ id: 'r1', name: 'Alice' }] } });
    expect(wrapper.text()).toContain('r1');
    expect(wrapper.text()).toContain('Alice');
  });

  it('shows empty state message when data is empty', () => {
    wrapper = mount(DataTable, {
      props: { columns, data: [], emptyMessage: 'Nothing here.' },
    });
    expect(wrapper.text()).toContain('Nothing here.');
  });

  it('shows default empty message when none provided', () => {
    wrapper = mount(DataTable, { props: { columns, data: [] } });
    expect(wrapper.text()).toContain('No data.');
  });

  it('shows pagination info', () => {
    wrapper = mount(DataTable, { props: { columns, data: makeData(5), pageSize: 10 } });
    expect(wrapper.text()).toContain('Page 1 of 1');
  });

  it('shows multiple pages when data exceeds pageSize', () => {
    wrapper = mount(DataTable, { props: { columns, data: makeData(15), pageSize: 5 } });
    expect(wrapper.text()).toContain('Page 1 of 3');
  });

  it('does not show Load more button when hasMore is false', () => {
    wrapper = mount(DataTable, {
      props: { columns, data: makeData(2), pageSize: 10, hasMore: false },
    });
    expect(wrapper.text()).not.toContain('Load more');
  });

  it('shows Load more button on last page when hasMore is true', () => {
    wrapper = mount(DataTable, {
      props: { columns, data: makeData(2), pageSize: 10, hasMore: true },
    });
    expect(wrapper.text()).toContain('Load more');
  });

  it('emits loadMore when Load more is clicked', async () => {
    wrapper = mount(DataTable, {
      props: { columns, data: makeData(2), pageSize: 10, hasMore: true },
    });
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Load more');
    expect(btn).toBeDefined();
    await btn!.trigger('click');
    expect(wrapper.emitted('loadMore')).toBeTruthy();
  });

  it('does not show Load more on non-last page even if hasMore is true', async () => {
    wrapper = mount(DataTable, {
      props: { columns, data: makeData(15), pageSize: 5, hasMore: true },
    });
    // On page 1 of 3 — not the last page, so no Load more
    expect(wrapper.text()).not.toContain('Load more');
  });

  it('previous page button is disabled on first page', () => {
    wrapper = mount(DataTable, { props: { columns, data: makeData(2), pageSize: 10 } });
    const buttons = wrapper.findAll('button');
    // At least the prev button should be disabled
    const disabledButtons = buttons.filter((b) => b.attributes('disabled') !== undefined);
    expect(disabledButtons.length).toBeGreaterThan(0);
  });

  it('exposes table instance via defineExpose', () => {
    wrapper = mount(DataTable, { props: { columns, data: makeData(3) } });
    const exposed = (wrapper.vm as unknown as { table: unknown }).table;
    expect(exposed).toBeDefined();
  });

  it('renders custom cell via render function', () => {
    const cols: ColumnDef<unknown, unknown>[] = [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => h('span', { class: 'custom' }, row.getValue('name')),
      },
    ];
    wrapper = mount(DataTable, { props: { columns: cols, data: [{ id: 'r1', name: 'Alice' }] } });
    expect(wrapper.find('span.custom').text()).toBe('Alice');
  });
});
