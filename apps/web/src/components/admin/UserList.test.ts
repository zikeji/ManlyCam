import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import UserList from './UserList.vue';
import { Role } from '@manlycam/types';
import type { AdminUser } from '@/composables/useAdminUsers';

const mockUsers = ref<AdminUser[]>([]);
const mockIsLoading = ref(false);
const mockError = ref<string | null>(null);
const mockUpdateRole = vi.fn();

vi.mock('@/composables/useAdminUsers', () => ({
  useAdminUsers: () => ({
    users: mockUsers,
    isLoading: mockIsLoading,
    error: mockError,
    fetchUsers: vi.fn(),
    updateRole: mockUpdateRole,
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
      } as unknown as AdminUser,
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
      } as unknown as AdminUser,
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
    } as unknown as AdminUser);
    mockUsers.value.push({
      id: 'u4',
      displayName: 'Guest',
      email: 'guest@e.com',
      role: Role.ViewerGuest,
    } as unknown as AdminUser);
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
    expect(adminRow?.find('button').exists()).toBe(false);
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
    // mock is hardcoded to emit 'Moderator', so set user role to 'Moderator'
    mockUsers.value[1].role = Role.Moderator;
    await radioGroup.trigger('click');
    expect(mockUpdateRole).not.toHaveBeenCalled();
  });
});
