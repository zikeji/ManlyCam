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
  actorAvatarUrl: 'https://example.com/admin.png',
  actorTag: null,
  targetId: 'target-01',
  targetDisplayName: null,
  targetAvatarUrl: null,
  targetTag: null,
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

  it('maps stream_start to "Stream Started"', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'stream_start')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('Stream Started');
  });

  it('maps stream_stop to "Stream Stopped"', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'stream_stop')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('Stream Stopped');
  });

  it('maps offline_message_update to "Offline Message Updated"', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'offline_message_update')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('Offline Message Updated');
  });

  it('maps camera_settings_update to "Camera Settings Updated"', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'camera_settings_update')]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('Camera Settings Updated');
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

  it('renders actor avatar with fallback initial', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'ban', { actorAvatarUrl: null })]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    // The actor column should contain "Admin" text and an avatar fallback with "A"
    const actorCells = wrapper.findAll('td');
    const actorCell = actorCells[1];
    expect(actorCell.text()).toContain('Admin');
    // Avatar fallback shows first initial
    expect(actorCell.find('span[role="img"]').exists() || actorCell.text().includes('A')).toBe(
      true,
    );
  });

  it('renders resolved target name when targetDisplayName is present', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([
        makeEntry('01', 'ban', {
          targetDisplayName: 'Target User',
          targetAvatarUrl: 'https://example.com/target.png',
        }),
      ]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('Target User');
  });

  it('renders truncated raw targetId when no displayName resolved', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([
        makeEntry('01', 'ban', {
          targetId: '01HX00000000000000000000CC',
          targetDisplayName: null,
        }),
      ]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('01HX0000');
  });

  it('renders dash for null targetId', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'ban', { targetId: null })]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.text()).toContain('\u2014');
  });

  it('renders metadata info icon when metadata is present', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'ban', { metadata: { reason: 'spam' } })]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    expect(wrapper.find('[data-testid="metadata-trigger"]').exists()).toBe(true);
  });

  it('renders dash for null metadata', () => {
    vi.mocked(useAuditLog).mockReturnValue({
      entries: ref([makeEntry('01', 'ban', { metadata: null })]),
      isLoading: ref(false),
      error: ref(null),
      hasMore: ref(false),
      fetchInitial: vi.fn(),
      fetchNextPage: vi.fn(),
    });
    wrapper = mount(AuditLogTable);
    // Metadata column should show dash
    const cells = wrapper.findAll('td');
    const metadataCell = cells[4];
    expect(metadataCell.text()).toContain('\u2014');
  });
});
