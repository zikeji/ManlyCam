import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import MyClipsDialog from './MyClipsDialog.vue';

// vi.hoisted runs before any imports; use require() to access Vue synchronously
const {
  mockClips,
  mockTotal,
  mockCurrentPage,
  mockIsLoading,
  mockError,
  mockFetchClips,
  mockDeleteClip,
  mockUpdateClip,
  mockShareClipToChat,
  mockCopyClipLink,
  mockDownloadClip,
  mockUser,
} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vueModule = require('vue') as typeof import('vue');
  return {
    mockClips: vueModule.ref<unknown[]>([]),
    mockTotal: vueModule.ref(0),
    mockCurrentPage: vueModule.ref(0),
    mockIsLoading: vueModule.ref(false),
    mockError: vueModule.ref<string | null>(null),
    mockFetchClips: vi.fn().mockResolvedValue(undefined),
    mockDeleteClip: vi.fn().mockResolvedValue(undefined),
    mockUpdateClip: vi.fn().mockResolvedValue(undefined),
    mockShareClipToChat: vi.fn().mockResolvedValue(undefined),
    mockCopyClipLink: vi.fn().mockResolvedValue(undefined),
    mockDownloadClip: vi.fn(),
    mockUser: vueModule.ref<{ id: string; role: string; mutedAt: string | null } | null>({
      id: 'user-001',
      role: 'ViewerGuest',
      mutedAt: null,
    }),
  };
});

vi.mock('@/composables/useClips', () => ({
  clips: mockClips,
  useClips: () => ({
    clips: mockClips,
    total: mockTotal,
    currentPage: mockCurrentPage,
    isLoading: mockIsLoading,
    error: mockError,
    fetchClips: mockFetchClips,
    deleteClip: mockDeleteClip,
    updateClip: mockUpdateClip,
    shareClipToChat: mockShareClipToChat,
    copyClipLink: mockCopyClipLink,
    downloadClip: mockDownloadClip,
  }),
}));

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('vue-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/ui/button', () => ({ Button: { template: '<button><slot /></button>' } }));
vi.mock('@/components/ui/badge', () => ({ Badge: { template: '<span><slot /></span>' } }));
vi.mock('@/components/ui/switch', () => ({
  Switch: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
  },
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
  DialogContent: { template: '<div><slot /></div>' },
  DialogHeader: { template: '<div><slot /></div>' },
  DialogTitle: { template: '<div><slot /></div>' },
}));
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
  AlertDialogContent: { template: '<div><slot /></div>' },
  AlertDialogHeader: { template: '<div><slot /></div>' },
  AlertDialogTitle: { template: '<div><slot /></div>' },
  AlertDialogDescription: { template: '<div><slot /></div>' },
  AlertDialogFooter: { template: '<div><slot /></div>' },
  AlertDialogCancel: {
    template:
      '<button data-testid="delete-cancel-button" @click="$emit(\'click\')"><slot /></button>',
  },
  AlertDialogAction: {
    template:
      '<button data-testid="delete-confirm-button" @click="$emit(\'click\')"><slot /></button>',
  },
}));
vi.mock('@/components/clips/ClipEditForm.vue', () => ({
  default: {
    props: ['clip', 'userRole'],
    emits: ['save', 'cancel'],
    template:
      '<div data-testid="edit-form"><button @click="$emit(\'cancel\')">Cancel</button></div>',
  },
}));

const baseClip = {
  id: 'clip-001',
  userId: 'user-001',
  name: 'My Clip',
  description: null,
  status: 'ready',
  visibility: 'private',
  thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
  durationSeconds: 90,
  showClipper: false,
  showClipperAvatar: false,
  clipperName: null,
  clipperAvatarUrl: null,
  createdAt: '2026-03-22T10:00:00.000Z',
  updatedAt: null,
  lastEditedAt: null,
  clipperDisplayName: 'Test User',
  clipperAvatarUrlOwner: null,
  clipperRole: 'ViewerGuest',
};

let wrapper: ReturnType<typeof mount> | null = null;

function mountOpen() {
  return mount(MyClipsDialog, { props: { open: true }, attachTo: document.body });
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.clearAllMocks();
  mockClips.value = [];
  mockTotal.value = 0;
  mockCurrentPage.value = 0;
  mockIsLoading.value = false;
  mockError.value = null;
  mockUser.value = { id: 'user-001', role: 'ViewerGuest', mutedAt: null };
});

describe('MyClipsDialog', () => {
  it('calls fetchClips when dialog opens', async () => {
    wrapper = mountOpen();
    await flushPromises();
    expect(mockFetchClips).toHaveBeenCalledWith({ page: 0, includeShared: false, all: false });
  });

  it('does not call fetchClips when dialog is closed', async () => {
    wrapper = mount(MyClipsDialog, { props: { open: false } });
    await flushPromises();
    expect(mockFetchClips).not.toHaveBeenCalled();
  });

  it('resets filters and refetches when dialog reopens', async () => {
    wrapper = mount(MyClipsDialog, { props: { open: false } });
    await flushPromises();
    vi.clearAllMocks();
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(mockFetchClips).toHaveBeenCalledWith({ page: 0, includeShared: false, all: false });
  });

  it('shows loading spinner when loading and clips empty', async () => {
    mockIsLoading.value = true;
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="loading-spinner"]').exists()).toBe(true);
  });

  it('shows empty message when no clips and not loading', async () => {
    wrapper = mountOpen();
    await flushPromises();
    expect(wrapper.find('[data-testid="empty-message"]').exists()).toBe(true);
  });

  it('shows error message when error set', async () => {
    mockError.value = 'Failed to load';
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="error-message"]').text()).toContain('Failed to load');
  });

  it('renders ready clip card', async () => {
    mockClips.value = [{ ...baseClip }];
    mockTotal.value = 1;
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="clip-card-clip-001"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="clip-name"]').text()).toBe('My Clip');
    expect(wrapper.find('[data-testid="duration-badge"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="visibility-badge"]').text()).toBe('Private');
  });

  it('formats duration correctly', async () => {
    mockClips.value = [{ ...baseClip, durationSeconds: 90 }];
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="duration-badge"]').text()).toBe('1:30');
  });

  it('shows pending overlay for pending clips', async () => {
    mockClips.value = [{ ...baseClip, status: 'pending', durationSeconds: null }];
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="pending-overlay"]').exists()).toBe(true);
  });

  it('shows dismiss button for failed clips', async () => {
    mockClips.value = [{ ...baseClip, status: 'failed' }];
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="failed-message"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dismiss-button"]').exists()).toBe(true);
  });

  it('shows action buttons for ready clips', async () => {
    mockClips.value = [{ ...baseClip }];
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="share-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="copy-link-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="download-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="delete-button"]').exists()).toBe(true);
  });

  it('hides share button when user is muted', async () => {
    mockUser.value = { id: 'user-001', role: 'ViewerGuest', mutedAt: new Date().toISOString() };
    mockClips.value = [{ ...baseClip }];
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="share-button"]').exists()).toBe(false);
  });

  it('shows load more button when there are more clips', async () => {
    mockClips.value = [{ ...baseClip }];
    mockTotal.value = 5;
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="load-more-button"]').exists()).toBe(true);
  });

  it('shows Loading text in load-more button while loading', async () => {
    mockClips.value = [{ ...baseClip }];
    mockTotal.value = 5;
    mockIsLoading.value = true;
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="load-more-button"]').text()).toBe('Loading…');
  });

  it('calls loadMore with incremented page on load more click', async () => {
    mockClips.value = [{ ...baseClip }];
    mockTotal.value = 5;
    mockCurrentPage.value = 0;
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="load-more-button"]').trigger('click');
    await flushPromises();
    expect(mockFetchClips).toHaveBeenCalledWith({ page: 1, includeShared: false, all: false });
  });

  it('calls fetchClips with includeShared=true when toggle enabled', async () => {
    wrapper = mountOpen();
    await flushPromises();
    vi.clearAllMocks();
    await wrapper.find('[data-testid="include-shared-toggle"]').setValue(true);
    await flushPromises();
    expect(mockFetchClips).toHaveBeenCalledWith({ page: 0, includeShared: true, all: false });
  });

  it('shows admin toggle only for Admin user', async () => {
    mockUser.value = { id: 'user-001', role: 'Admin', mutedAt: null };
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="show-all-toggle"]').exists()).toBe(true);
  });

  it('does not show admin toggle for non-Admin user', async () => {
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="show-all-toggle"]').exists()).toBe(false);
  });

  it('calls fetchClips with all=true when admin show-all toggle enabled', async () => {
    mockUser.value = { id: 'user-001', role: 'Admin', mutedAt: null };
    wrapper = mountOpen();
    await flushPromises();
    vi.clearAllMocks();
    await wrapper.find('[data-testid="show-all-toggle"]').setValue(true);
    await flushPromises();
    expect(mockFetchClips).toHaveBeenCalledWith({ page: 0, includeShared: false, all: true });
  });

  it('shows Shared visibility label', async () => {
    mockClips.value = [{ ...baseClip, visibility: 'shared' }];
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="visibility-badge"]').text()).toBe('Shared');
  });

  it('shows Public visibility label', async () => {
    mockClips.value = [{ ...baseClip, visibility: 'public' }];
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="visibility-badge"]').text()).toBe('Public');
  });

  it('shows no preview placeholder when clip has no thumbnail', async () => {
    mockClips.value = [{ ...baseClip, thumbnailUrl: null }];
    wrapper = mountOpen();
    await nextTick();
    expect(wrapper.find('[data-testid="clip-card-clip-001"]').text()).toContain('No preview');
  });

  it('calls deleteClip when dismiss button clicked', async () => {
    mockClips.value = [{ ...baseClip, status: 'failed' }];
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="dismiss-button"]').trigger('click');
    await flushPromises();
    expect(mockDeleteClip).toHaveBeenCalledWith('clip-001');
  });

  it('opens confirm dialog when delete button clicked', async () => {
    mockClips.value = [{ ...baseClip }];
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="delete-button"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="delete-confirm-button"]').exists()).toBe(true);
  });

  it('calls deleteClip when confirm button clicked', async () => {
    mockClips.value = [{ ...baseClip }];
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="delete-button"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="delete-confirm-button"]').trigger('click');
    await flushPromises();
    expect(mockDeleteClip).toHaveBeenCalledWith('clip-001');
  });

  it('does not call deleteClip when cancel button clicked', async () => {
    mockClips.value = [{ ...baseClip }];
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="delete-button"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="delete-cancel-button"]').trigger('click');
    await nextTick();
    expect(mockDeleteClip).not.toHaveBeenCalled();
  });

  it('calls shareClipToChat when share button clicked', async () => {
    mockClips.value = [{ ...baseClip }];
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="share-button"]').trigger('click');
    await flushPromises();
    expect(mockShareClipToChat).toHaveBeenCalledWith('clip-001');
  });

  it('calls copyClipLink when copy link button clicked', async () => {
    mockClips.value = [{ ...baseClip }];
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="copy-link-button"]').trigger('click');
    await flushPromises();
    expect(mockCopyClipLink).toHaveBeenCalledWith('clip-001', 'private');
  });

  it('calls downloadClip when download button clicked', async () => {
    mockClips.value = [{ ...baseClip }];
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="download-button"]').trigger('click');
    expect(mockDownloadClip).toHaveBeenCalledWith('clip-001');
  });

  it('opens edit dialog when edit button clicked', async () => {
    mockClips.value = [{ ...baseClip }];
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="edit-form"]').exists()).toBe(true);
  });

  it('closes edit dialog when cancel emitted from edit form', async () => {
    mockClips.value = [{ ...baseClip }];
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="edit-form"]').exists()).toBe(true);
    await wrapper.find('[data-testid="edit-form"] button').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="edit-form"]').exists()).toBe(false);
  });

  it('calls updateClip and closes dialog on save', async () => {
    mockClips.value = [{ ...baseClip }];
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await nextTick();
    const vm = wrapper.vm as unknown as {
      onSaveEdit: (data: unknown) => Promise<void>;
      editingClip: unknown;
    };
    await vm.onSaveEdit({ name: 'New Name' });
    expect(mockUpdateClip).toHaveBeenCalledWith('clip-001', { name: 'New Name' });
    expect(vm.editingClip).toBeNull();
  });

  it('shows error toast when deleteClip (dismiss) fails', async () => {
    mockClips.value = [{ ...baseClip, status: 'failed' }];
    mockDeleteClip.mockRejectedValueOnce(new Error('Delete failed'));
    const { toast } = await import('vue-sonner');
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="dismiss-button"]').trigger('click');
    await flushPromises();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Delete failed');
  });

  it('shows error toast when onConfirmDelete fails', async () => {
    mockClips.value = [{ ...baseClip }];
    mockDeleteClip.mockRejectedValueOnce(new Error('Delete failed'));
    const { toast } = await import('vue-sonner');
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="delete-button"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="delete-confirm-button"]').trigger('click');
    await flushPromises();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Delete failed');
  });

  it('shows error toast when share fails', async () => {
    mockClips.value = [{ ...baseClip }];
    mockShareClipToChat.mockRejectedValueOnce(new Error('Share failed'));
    const { toast } = await import('vue-sonner');
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="share-button"]').trigger('click');
    await flushPromises();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Share failed');
  });

  it('shows error toast when copy link fails', async () => {
    mockClips.value = [{ ...baseClip }];
    mockCopyClipLink.mockRejectedValueOnce(new Error('Copy failed'));
    const { toast } = await import('vue-sonner');
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="copy-link-button"]').trigger('click');
    await flushPromises();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Copy failed');
  });

  it('shows error toast when updateClip fails', async () => {
    mockClips.value = [{ ...baseClip }];
    mockUpdateClip.mockRejectedValueOnce(new Error('Update failed'));
    const { toast } = await import('vue-sonner');
    wrapper = mountOpen();
    await nextTick();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await nextTick();
    const vm = wrapper.vm as unknown as { onSaveEdit: (data: unknown) => Promise<void> };
    await vm.onSaveEdit({ name: 'New Name' });
    await flushPromises();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Update failed');
  });
});
