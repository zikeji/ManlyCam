import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import AuditLogTable from './AuditLogTable.vue';

vi.mock('@/composables/useAuditLog', () => ({
  useAuditLog: vi.fn(),
}));

import { useAuditLog } from '@/composables/useAuditLog';
import { ref } from 'vue';

const makeEntry = (id: string, action: string, overrides = {}) => ({
  id,
  action,
  actorId: 'actor-01',
  actorDisplayName: 'Admin',
  targetId: 'target-01',
  metadata: null,
  performedAt: '2026-03-19T15:45:00.000Z',
  ...overrides,
});

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('AuditLogTable', () => {
  beforeEach(() => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
  });

  it('calls fetchInitial on mount', () => {
    const fetchInitial = vi.fn();
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial,
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(fetchInitial).toHaveBeenCalledOnce();
  });

  it('shows loading spinner when isLoading and no entries', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([]),
      isLoading: ref(true),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('shows empty state message when no entries', () => {
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('No moderation actions recorded yet.');
  });

  it('maps message_delete to "Message Deleted"', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'message_delete')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('Message Deleted');
  });

  it('maps mute to "User Muted"', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'mute')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('User Muted');
  });

  it('maps unmute to "User Unmuted"', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'unmute')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('User Unmuted');
  });

  it('maps ban to "User Banned"', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'ban')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('User Banned');
  });

  it('maps unban to "User Unbanned"', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'unban')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('User Unbanned');
  });

  it('maps reaction_remove to "Reaction Removed"', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'reaction_remove')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('Reaction Removed');
  });

  it('falls back to raw action string for unknown actions', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'some_future_action')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('some_future_action');
  });

  it('formats timestamp as date + time', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'ban')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    // Should contain year 2026 (locale-dependent but year is always rendered)
    expect(wrapper.text()).toContain('2026');
  });

  it('renders — for null targetId', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'ban', { targetId: null })]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('—');
  });
});
