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
const mockUpdateRole = vi.fn();
const mockUpdateUserTag = vi.fn();
const mockClearUserTag = vi.fn();

vi.mock('@/composables/useAdminUsers', () => ({
  useAdminUsers: () => ({
    users: mockUsers,
    isLoading: mockIsLoading,
    error: mockError,
    fetchUsers: vi.fn(),
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

// Mock UI components
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: defineComponent({ template: '<div><slot/></div>' }),
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: defineComponent({ template: '<div><slot/></div>' }),
  DropdownMenuTrigger: defineComponent({ template: '<div><slot/></div>' }),
  DropdownMenuContent: defineComponent({ template: '<div><slot/></div>' }),
  DropdownMenuRadioGroup: defineComponent({
    name: 'DropdownMenuRadioGroup',
    props: ['modelValue'],
    template: "<div @click=\"$emit('update:modelValue', 'Moderator')\"><slot/></div>",
  }),
  DropdownMenuRadioItem: defineComponent({ props: ['value'], template: '<div><slot/></div>' }),
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: defineComponent({
    name: 'Popover',
    props: ['open'],
    emits: ['update:open'],
    template: '<div><slot/></div>',
  }),
  PopoverTrigger: defineComponent({ template: '<div><slot/></div>' }),
  PopoverContent: defineComponent({ template: '<div><slot/></div>' }),
}));

// Mock Reka UI color components while preserving other exports (e.g. Primitive)
vi.mock('reka-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('reka-ui')>();
  return {
    ...actual,
    ColorAreaRoot: defineComponent({
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<div data-testid="color-area-root"><slot/></div>',
    }),
    ColorAreaArea: defineComponent({ template: '<div/>' }),
    ColorAreaThumb: defineComponent({ template: '<div/>' }),
    ColorSliderRoot: defineComponent({
      props: ['modelValue', 'channel'],
      emits: ['update:modelValue'],
      template: '<div data-testid="hue-slider-root"><slot/></div>',
    }),
    ColorSliderTrack: defineComponent({ template: '<div/>' }),
    ColorSliderThumb: defineComponent({ template: '<div/>' }),
    ColorFieldRoot: defineComponent({
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<div data-testid="color-field-root"><slot/></div>',
    }),
    ColorFieldInput: defineComponent({ template: '<input data-testid="color-field-input"/>' }),
    ColorSwatchPickerRoot: defineComponent({
      name: 'ColorSwatchPickerRoot',
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<div data-testid="swatch-picker-root"><slot/></div>',
    }),
    ColorSwatchPickerItem: defineComponent({
      props: ['value'],
      template: '<div class="swatch-item"><slot/></div>',
    }),
    ColorSwatchPickerItemSwatch: defineComponent({ template: '<div/>' }),
    ColorSwatchPickerItemIndicator: defineComponent({ template: '<div/>' }),
    parseColor: vi.fn((hex: string) => ({ hex, toString: () => hex })),
    colorToHex: vi.fn((c: unknown) => {
      if (typeof c === 'object' && c !== null && 'hex' in c) return (c as { hex: string }).hex;
      return USER_TAG_PALETTE[0];
    }),
  };
});

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
      {
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
      } as AdminUser,
    ];
    mockIsLoading.value = false;
    mockError.value = null;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.clearAllMocks();
  });

  it('renders a table of users', () => {
    wrapper = mount(UserList);
    expect(wrapper.text()).toContain('Admin User');
    expect(wrapper.text()).toContain('admin@example.com');
    expect(wrapper.text()).toContain('Company User');
    expect(wrapper.text()).toContain('user@company.com');
  });

  it('renders role badges with correct variants', () => {
    mockUsers.value.push({
      id: 'u3',
      displayName: 'Mod',
      email: 'mod@e.com',
      role: Role.Moderator,
      userTagText: null,
      userTagColor: null,
    } as AdminUser);
    mockUsers.value.push({
      id: 'u4',
      displayName: 'Guest',
      email: 'guest@e.com',
      role: Role.ViewerGuest,
      userTagText: null,
      userTagColor: null,
    } as AdminUser);
    wrapper = mount(UserList);
    expect(wrapper.text()).toContain('Admin');
    expect(wrapper.text()).toContain('ViewerCompany');
    expect(wrapper.text()).toContain('Moderator');
    expect(wrapper.text()).toContain('ViewerGuest');
  });

  it('disables role editing for current user', () => {
    wrapper = mount(UserList);
    const adminRow = wrapper.findAll('tr').find((r) => r.text().includes('admin@example.com'));
    expect(adminRow?.text()).toContain('You');
  });

  it('allows changing role for other users', () => {
    wrapper = mount(UserList);
    const userRow = wrapper.findAll('tr').find((r) => r.text().includes('user@company.com'));
    expect(userRow?.text()).toContain('Change Role');
  });

  it('calls updateRole when a new role is selected', async () => {
    wrapper = mount(UserList);
    const radioGroup = wrapper.findComponent({ name: 'DropdownMenuRadioGroup' });
    expect(radioGroup.exists()).toBe(true);
    await radioGroup.trigger('click');
    expect(mockUpdateRole).toHaveBeenCalledWith('u2', Role.Moderator);
  });

  it('does nothing if same role is selected', async () => {
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

  // Set Tag UI tests
  it('renders Set Tag button for each user row', () => {
    wrapper = mount(UserList);
    const setTagBtns = wrapper.findAll('[data-testid="set-tag-btn"]');
    expect(setTagBtns).toHaveLength(2);
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

  it('renders the swatch picker with 12 swatches', async () => {
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

  it('resets tag state (text and color) after Clear succeeds', async () => {
    mockUsers.value[0].userTagText = 'VIP';
    mockUsers.value[0].userTagColor = '#ef4444';
    wrapper = mount(UserList);

    // Open the popover so state is initialized
    const setTagBtn = wrapper.find('[data-testid="set-tag-btn"]');
    await setTagBtn.trigger('click');

    expect((wrapper.find('[data-testid="tag-text-input"]').element as HTMLInputElement).value).toBe(
      'VIP',
    );

    // Clear — popover closes (v-if unmounts content)
    await wrapper.find('[data-testid="clear-tag-btn"]').trigger('click');

    // Re-open: user.userTagText is now null (optimistic update), so input should be empty
    mockUsers.value[0].userTagText = null;
    mockUsers.value[0].userTagColor = null;
    await setTagBtn.trigger('click');

    expect((wrapper.find('[data-testid="tag-text-input"]').element as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('shows color dot indicator when user has a tag set', () => {
    mockUsers.value[0].userTagText = 'VIP';
    mockUsers.value[0].userTagColor = '#ef4444';
    wrapper = mount(UserList);
    const rows = wrapper.findAll('tr');
    const adminRow = rows.find((r) => r.text().includes('admin@example.com'));
    const colorDot = adminRow?.find('span[style]');
    expect(colorDot?.exists()).toBe(true);
  });

  it('pre-populates tag text input from user data when Set Tag is clicked', async () => {
    mockUsers.value[0].userTagText = 'ExistingTag';
    mockUsers.value[0].userTagColor = '#ef4444';
    wrapper = mount(UserList);

    const setTagBtn = wrapper.find('[data-testid="set-tag-btn"]');
    await setTagBtn.trigger('click');

    const input = wrapper.find('[data-testid="tag-text-input"]') as ReturnType<typeof wrapper.find>;
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

    const clearBtn = wrapper.find('[data-testid="clear-tag-btn"]');
    await expect(clearBtn.trigger('click')).resolves.not.toThrow();
  });

  it('shows loading state when loading with no users', () => {
    mockIsLoading.value = true;
    mockUsers.value = [];
    wrapper = mount(UserList);
    expect(wrapper.text()).toContain('Loading users');
  });

  it('shows error state when error is set', () => {
    mockError.value = 'Failed to load';
    wrapper = mount(UserList);
    expect(wrapper.text()).toContain('Failed to load');
  });

  it('shows System Admin label for Admin users that are not current user', () => {
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
    const adminRow = wrapper.findAll('tr').find((r) => r.text().includes('otheradmin@example.com'));
    expect(adminRow?.text()).toContain('System Admin');
  });
});
