import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import AdminDialog from './AdminDialog.vue';

// Render alert-dialog components inline (no portal / teleport) for test isolation
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: { template: '<div v-if="open"><slot /></div>', props: ['open'] },
  AlertDialogContent: { template: '<div><slot /></div>' },
  AlertDialogHeader: { template: '<div><slot /></div>' },
  AlertDialogTitle: { template: '<div><slot /></div>' },
  AlertDialogCancel: {
    template: '<button @click="$emit(\'click\')"><slot /></button>',
    emits: ['click'],
  },
}));

vi.mock('./UserList.vue', () => ({
  default: { template: '<div data-testid="user-list">UserList</div>' },
}));

vi.mock('./AllowlistPanel.vue', () => ({
  default: { template: '<div data-testid="allowlist-panel">AllowlistPanel</div>' },
}));

vi.mock('./AuditLogTable.vue', () => ({
  default: { template: '<div data-testid="audit-log-table">AuditLogTable</div>' },
}));

vi.mock('./StreamOnlyPanel.vue', () => ({
  default: { template: '<div data-testid="stream-only-panel">StreamOnlyPanel</div>' },
}));

describe('AdminDialog', () => {
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders with title "Admin" when open', () => {
    wrapper = mount(AdminDialog, { props: { open: true } });
    expect(wrapper.text()).toContain('Admin');
  });

  it('renders Users, Allowlist, Audit Log, and Stream Link tab triggers', () => {
    wrapper = mount(AdminDialog, { props: { open: true } });
    expect(wrapper.text()).toContain('Users');
    expect(wrapper.text()).toContain('Allowlist');
    expect(wrapper.text()).toContain('Audit Log');
    expect(wrapper.text()).toContain('Stream Link');
  });

  it('renders UserList in the Users tab content', () => {
    wrapper = mount(AdminDialog, { props: { open: true } });
    expect(wrapper.find('[data-testid="user-list"]').exists()).toBe(true);
  });

  it('renders AllowlistPanel (force-mounted in Allowlist TabsContent)', () => {
    wrapper = mount(AdminDialog, { props: { open: true } });
    // AllowlistPanel is force-mounted so it's always in DOM when dialog is open
    expect(wrapper.find('[data-testid="allowlist-panel"]').exists()).toBe(true);
  });

  it('renders a close/cancel button in the header', () => {
    wrapper = mount(AdminDialog, { props: { open: true } });
    // Cancel button rendered in the header (X icon button)
    const cancelBtn = wrapper.find('button');
    expect(cancelBtn.exists()).toBe(true);
  });

  it('renders AuditLogTable in the Audit Log tab content', () => {
    wrapper = mount(AdminDialog, { props: { open: true } });
    expect(wrapper.find('[data-testid="audit-log-table"]').exists()).toBe(true);
  });

  it('renders StreamOnlyPanel in the Stream Link tab content', () => {
    wrapper = mount(AdminDialog, { props: { open: true } });
    expect(wrapper.find('[data-testid="stream-only-panel"]').exists()).toBe(true);
  });

  it('does not render content when closed', () => {
    wrapper = mount(AdminDialog, { props: { open: false } });
    expect(wrapper.find('[data-testid="user-list"]').exists()).toBe(false);
  });
});
