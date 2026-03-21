import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import UserList from './UserList.vue';
import { Role } from '@manlycam/types';
import type { AdminUser } from '@/composables/useAdminUsers';
import { USER_TAG_PALETTE } from '@/lib/userTagPalette';

const mockUsers = ref<AdminUser[]>([]);
const mockIsLoading = ref(false);
const mockError = ref<string | null>(null);
const mockFetchUsers = vi.fn();
const mockUpdateRole = vi.fn();
const mockUpdateUserTag = vi.fn();
const mockClearUserTag = vi.fn();
const mockBanUserById = vi.fn();
const mockUnbanUserById = vi.fn();

vi.mock('@/composables/useAdminUsers', () => ({
  useAdminUsers: () => ({
    users: mockUsers,
    isLoading: mockIsLoading,
    error: mockError,
    fetchUsers: mockFetchUsers,
    banUserById: mockBanUserById,
    unbanUserById: mockUnbanUserById,
    updateRole: mockUpdateRole,
    updateUserTag: mockUpdateUserTag,
    clearUserTag: mockClearUserTag,
  }),
}));

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    user: ref({ id: 'u1', role: Role.Admin }),
  }),
}));

// Switch mock: forwards attrs so data-testid from parent template works
vi.mock('@/components/ui/switch', () => ({
  Switch: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<button v-bind="$attrs" @click="$emit(\'update:modelValue\', !modelValue)"><slot /></button>',
  }),
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: defineComponent({
    props: ['open'],
    template: '<div><slot v-if="open" /></div>',
  }),
  AlertDialogContent: defineComponent({ template: '<div><slot /></div>' }),
  AlertDialogHeader: defineComponent({ template: '<div><slot /></div>' }),
  AlertDialogTitle: defineComponent({ template: '<div><slot /></div>' }),
  AlertDialogDescription: defineComponent({ template: '<div><slot /></div>' }),
  AlertDialogFooter: defineComponent({ template: '<div><slot /></div>' }),
  AlertDialogCancel: defineComponent({ template: '<button><slot /></button>' }),
  AlertDialogAction: defineComponent({
    inheritAttrs: false,
    template: '<button v-bind="$attrs"><slot /></button>',
  }),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: defineComponent({ template: '<div><slot /></div>' }),
  DropdownMenuTrigger: defineComponent({ template: '<div><slot /></div>' }),
  DropdownMenuContent: defineComponent({ template: '<div><slot /></div>' }),
  DropdownMenuItem: defineComponent({
    inheritAttrs: false,
    emits: ['click'],
    template: '<div v-bind="$attrs" @click="$emit(\'click\')"><slot /></div>',
  }),
  DropdownMenuSeparator: defineComponent({ template: '<hr />' }),
  DropdownMenuSub: defineComponent({ template: '<div><slot /></div>' }),
  DropdownMenuSubTrigger: defineComponent({ template: '<div><slot /></div>' }),
  DropdownMenuSubContent: defineComponent({ template: '<div><slot /></div>' }),
  DropdownMenuRadioGroup: defineComponent({
    name: 'DropdownMenuRadioGroup',
    props: ['modelValue'],
    template: "<div @click=\"$emit('update:modelValue', 'Moderator')\"><slot /></div>",
  }),
  DropdownMenuRadioItem: defineComponent({ props: ['value'], template: '<div><slot /></div>' }),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: defineComponent({
    name: 'Popover',
    props: ['open'],
    emits: ['update:open'],
    template: '<div><slot /></div>',
  }),
  PopoverTrigger: defineComponent({ template: '<div><slot /></div>' }),
  PopoverContent: defineComponent({ template: '<div><slot /></div>' }),
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: defineComponent({ template: '<div><slot /></div>' }),
  AvatarImage: defineComponent({ props: ['src'], template: '<img />' }),
  AvatarFallback: defineComponent({ template: '<div><slot /></div>' }),
}));

// Mock Reka UI color components — forward attrs so data-testid from h() calls work
vi.mock('reka-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('reka-ui')>();
  return {
    ...actual,
    ColorAreaRoot: defineComponent({
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<div><slot /></div>',
    }),
    ColorAreaArea: defineComponent({ template: '<div />' }),
    ColorAreaThumb: defineComponent({ template: '<div />' }),
    ColorSliderRoot: defineComponent({
      props: ['modelValue', 'channel'],
      emits: ['update:modelValue'],
      // forward attrs so data-testid="hue-slider" from h() appears on element
      template: '<div v-bind="$attrs"><slot /></div>',
    }),
    ColorSliderTrack: defineComponent({ template: '<div />' }),
    ColorSliderThumb: defineComponent({ template: '<div />' }),
    ColorFieldRoot: defineComponent({
      props: ['modelValue'],
      emits: ['update:modelValue'],
      // forward attrs so data-testid="color-field" from h() appears on element
      template: '<div v-bind="$attrs"><slot /></div>',
    }),
    ColorFieldInput: defineComponent({ template: '<input data-testid="color-field-input" />' }),
    ColorSwatchPickerRoot: defineComponent({
      name: 'ColorSwatchPickerRoot',
      props: ['modelValue'],
      emits: ['update:modelValue'],
      // forward attrs so data-testid="swatch-picker" from h() appears on element
      template: '<div v-bind="$attrs"><slot /></div>',
    }),
    ColorSwatchPickerItem: defineComponent({
      props: ['value'],
      template: '<div class="swatch-item"><slot /></div>',
    }),
    ColorSwatchPickerItemSwatch: defineComponent({ template: '<div />' }),
    ColorSwatchPickerItemIndicator: defineComponent({ template: '<div />' }),
    parseColor: vi.fn((hex: string) => ({ hex, toString: () => hex })),
    colorToHex: vi.fn((c: unknown) => {
      if (typeof c === 'object' && c !== null && 'hex' in c) return (c as { hex: string }).hex;
      return USER_TAG_PALETTE[0];
    }),
  };
});

// Helper to create test users
const makeUser = (overrides: Partial<AdminUser> = {}): AdminUser =>
  ({
    id: 'u2',
    displayName: 'Company User',
    email: 'user@company.com',
    role: Role.ViewerCompany,
    avatarUrl: null,
    bannedAt: null,
    mutedAt: null,
    firstSeenAt: '2026-03-05T10:00:00Z',
    lastSeenAt: '2026-03-09T10:00:00Z',
    userTagText: null,
    userTagColor: null,
    ...overrides,
  }) as AdminUser;

describe('UserList.vue', () => {
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    mockUsers.value = [
      {
        id: 'u1',
        displayName: 'Admin User',
        email: 'admin@example.com',
        role: Role.Admin,
        avatarUrl: null,
        bannedAt: null,
        mutedAt: null,
        firstSeenAt: '2026-03-01T10:00:00Z',
        lastSeenAt: '2026-03-10T10:00:00Z',
        userTagText: null,
        userTagColor: null,
      } as AdminUser,
      makeUser(),
    ];
    mockIsLoading.value = false;
    mockError.value = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  // Task 10.1: skeleton while loading, table absent
  it('shows skeleton loader while loading with no users', () => {
    mockIsLoading.value = true;
    mockUsers.value = [];
    wrapper = mount(UserList);
    expect(wrapper.find('[data-testid="skeleton-loader"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="users-table-wrapper"]').exists()).toBe(false);
  });

  // Task 10.2: table renders with expected columns after load
  it('renders users-table-wrapper when users are loaded', () => {
    wrapper = mount(UserList);
    expect(wrapper.find('[data-testid="users-table-wrapper"]').exists()).toBe(true);
  });

  it('renders user display names in table', () => {
    wrapper = mount(UserList);
    expect(wrapper.text()).toContain('Admin User');
    expect(wrapper.text()).toContain('Company User');
  });

  // Task 10.3: banned user hidden by default; visible when "Show banned" toggled on
  it('hides banned users by default', async () => {
    mockUsers.value = [
      makeUser({ id: 'u2', displayName: 'Active User', bannedAt: null }),
      makeUser({ id: 'u3', displayName: 'Banned User', bannedAt: '2026-01-01T00:00:00Z' }),
    ];
    wrapper = mount(UserList);
    // Banned user not rendered
    expect(wrapper.text()).toContain('Active User');
    expect(wrapper.text()).not.toContain('Banned User');
  });

  it('shows banned users when "Show banned" toggle is enabled', async () => {
    mockUsers.value = [
      makeUser({ id: 'u2', displayName: 'Active User', bannedAt: null }),
      makeUser({ id: 'u3', displayName: 'Banned User', bannedAt: '2026-01-01T00:00:00Z' }),
    ];
    wrapper = mount(UserList);
    // Toggle on
    await wrapper.find('[data-testid="show-banned-toggle"]').trigger('click');
    expect(wrapper.text()).toContain('Banned User');
  });

  // Task 10.4: Refresh button triggers fetchUsers
  it('calls fetchUsers when Refresh button is clicked', async () => {
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="refresh-btn"]').trigger('click');
    expect(mockFetchUsers).toHaveBeenCalled();
  });

  it('calls fetchUsers on mount when users list is empty', () => {
    mockUsers.value = [];
    wrapper = mount(UserList);
    expect(mockFetchUsers).toHaveBeenCalledOnce();
  });

  it('does not call fetchUsers on mount when users list is not empty', () => {
    wrapper = mount(UserList);
    expect(mockFetchUsers).not.toHaveBeenCalled();
  });

  // Task 10.5: Ban action calls banUserById after confirmation
  it('calls banUserById after ban confirmation dialog', async () => {
    wrapper = mount(UserList);
    // Click the Ban action for u2 (non-admin, moderatable user)
    const banBtn = wrapper.find('[data-testid="action-ban-u2"]');
    expect(banBtn.exists()).toBe(true);
    await banBtn.trigger('click');

    // AlertDialog should now be open — confirm ban
    const confirmBtn = wrapper.find('[data-testid="confirm-ban-btn"]');
    expect(confirmBtn.exists()).toBe(true);
    await confirmBtn.trigger('click');

    expect(mockBanUserById).toHaveBeenCalledWith('u2');
  });

  // Task 10.6: Unban action calls unbanUserById
  it('calls unbanUserById when Unban action is clicked', async () => {
    mockUsers.value = [makeUser({ id: 'u2', bannedAt: '2026-01-01T00:00:00Z' })];
    wrapper = mount(UserList);

    // Enable show banned to see the user
    await wrapper.find('[data-testid="show-banned-toggle"]').trigger('click');

    const unbanBtn = wrapper.find('[data-testid="action-unban-u2"]');
    expect(unbanBtn.exists()).toBe(true);
    await unbanBtn.trigger('click');

    expect(mockUnbanUserById).toHaveBeenCalledWith('u2');
  });

  // Task 10.7: Change Role action updates role via updateRole
  it('calls updateRole when a new role is selected via Change Role', async () => {
    wrapper = mount(UserList);
    const radioGroup = wrapper.findComponent({ name: 'DropdownMenuRadioGroup' });
    expect(radioGroup.exists()).toBe(true);
    await radioGroup.trigger('click');
    expect(mockUpdateRole).toHaveBeenCalledWith('u2', Role.Moderator);
  });

  it('does nothing when same role is selected', async () => {
    wrapper = mount(UserList);
    const radioGroup = wrapper.findComponent({ name: 'DropdownMenuRadioGroup' });
    mockUsers.value[1].role = Role.Moderator;
    await radioGroup.trigger('click');
    expect(mockUpdateRole).not.toHaveBeenCalled();
  });

  it('does not throw when role update fails (error is caught)', async () => {
    mockUpdateRole.mockRejectedValue(new Error('Network error'));
    wrapper = mount(UserList);
    const radioGroup = wrapper.findComponent({ name: 'DropdownMenuRadioGroup' });
    await expect(radioGroup.trigger('click')).resolves.not.toThrow();
  });

  // Error and loading states
  it('shows error state when error is set', () => {
    mockError.value = 'Failed to load';
    wrapper = mount(UserList);
    expect(wrapper.text()).toContain('Failed to load');
  });

  // Set Tag UI tests (preserved from prior implementation)
  it('renders Set Tag button for each user row', () => {
    wrapper = mount(UserList);
    const setTagBtns = wrapper.findAll('[data-testid="set-tag-btn"]');
    expect(setTagBtns.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the color field in the popover', async () => {
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="set-tag-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="color-field"]').exists()).toBe(true);
  });

  it('renders the color area in the popover', async () => {
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="set-tag-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="color-area"]').exists()).toBe(true);
  });

  it('renders the hue slider in the popover', async () => {
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="set-tag-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="hue-slider"]').exists()).toBe(true);
  });

  it('renders the swatch picker with swatches', async () => {
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="set-tag-btn"]').trigger('click');
    const swatchPicker = wrapper.find('[data-testid="swatch-picker"]');
    expect(swatchPicker.exists()).toBe(true);
    const items = wrapper.findAll('.swatch-item');
    expect(items.length).toBe(USER_TAG_PALETTE.length);
  });

  it('renders text input in the tag popover content', async () => {
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="set-tag-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="tag-text-input"]').exists()).toBe(true);
  });

  it('calls updateUserTag when Save is clicked with text', async () => {
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="set-tag-btn"]').trigger('click');
    await wrapper.find('[data-testid="tag-text-input"]').setValue('VIP');
    await wrapper.find('[data-testid="save-tag-btn"]').trigger('click');
    expect(mockUpdateUserTag).toHaveBeenCalledWith('u1', 'VIP', expect.any(String));
  });

  it('calls clearUserTag when Save is clicked with empty text', async () => {
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="set-tag-btn"]').trigger('click');
    await wrapper.find('[data-testid="save-tag-btn"]').trigger('click');
    expect(mockClearUserTag).toHaveBeenCalledWith('u1');
    expect(mockUpdateUserTag).not.toHaveBeenCalled();
  });

  it('calls clearUserTag when Clear is clicked', async () => {
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="set-tag-btn"]').trigger('click');
    await wrapper.find('[data-testid="clear-tag-btn"]').trigger('click');
    expect(mockClearUserTag).toHaveBeenCalledWith('u1');
  });

  it('pre-populates tag text input from user data when Set Tag is clicked', async () => {
    mockUsers.value[0].userTagText = 'ExistingTag';
    mockUsers.value[0].userTagColor = '#ef4444';
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="set-tag-btn"]').trigger('click');
    const input = wrapper.find('[data-testid="tag-text-input"]');
    expect((input.element as HTMLInputElement).value).toBe('ExistingTag');
  });

  it('does not throw when Save fails (error is caught)', async () => {
    mockUpdateUserTag.mockRejectedValue(new Error('Network error'));
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="set-tag-btn"]').trigger('click');
    await wrapper.find('[data-testid="tag-text-input"]').setValue('VIP');
    await expect(
      wrapper.find('[data-testid="save-tag-btn"]').trigger('click'),
    ).resolves.not.toThrow();
  });

  it('does not throw when Clear fails (error is caught)', async () => {
    mockClearUserTag.mockRejectedValue(new Error('Network error'));
    wrapper = mount(UserList);
    await wrapper.find('[data-testid="set-tag-btn"]').trigger('click');
    await expect(
      wrapper.find('[data-testid="clear-tag-btn"]').trigger('click'),
    ).resolves.not.toThrow();
  });

  it('shows "You" label for current user row', () => {
    wrapper = mount(UserList);
    expect(wrapper.text()).toContain('You');
  });

  it('shows "System Admin" label for other admin users', () => {
    mockUsers.value.push({
      id: 'u99',
      displayName: 'Other Admin',
      email: 'otheradmin@example.com',
      role: Role.Admin,
      avatarUrl: null,
      bannedAt: null,
      mutedAt: null,
      firstSeenAt: '2026-01-01T00:00:00Z',
      lastSeenAt: null,
      userTagText: null,
      userTagColor: null,
    } as AdminUser);
    wrapper = mount(UserList);
    expect(wrapper.text()).toContain('System Admin');
  });

  it('renders role badges for all roles', () => {
    mockUsers.value.push(
      makeUser({ id: 'u3', displayName: 'Mod', role: Role.Moderator }),
      makeUser({ id: 'u4', displayName: 'Guest', role: Role.ViewerGuest }),
    );
    wrapper = mount(UserList);
    expect(wrapper.text()).toContain('Admin');
    expect(wrapper.text()).toContain('ViewerCompany');
    expect(wrapper.text()).toContain('Moderator');
    expect(wrapper.text()).toContain('ViewerGuest');
  });

  it('shows color dot indicator when user has a tag set', () => {
    mockUsers.value[0].userTagText = 'VIP';
    mockUsers.value[0].userTagColor = '#ef4444';
    wrapper = mount(UserList);
    const adminRow = wrapper.findAll('[data-testid="set-tag-btn"]');
    // First set-tag-btn is for admin user (u1 with tag set) — should show color dot
    expect(adminRow[0].find('span[style]').exists()).toBe(true);
  });

  // Task 10.8: afterEach cleanup is satisfied by the afterEach block above
});
