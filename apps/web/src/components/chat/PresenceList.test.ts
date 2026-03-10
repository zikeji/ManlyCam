import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';
import PresenceList from './PresenceList.vue';
import type { UserPresence } from '@manlycam/types';

// Stub Avatar components
vi.mock('@/components/ui/avatar', () => ({
  Avatar: defineComponent({
    template: '<div class="avatar-stub"><slot /></div>',
  }),
  AvatarImage: defineComponent({
    props: ['src', 'alt'],
    template: '<img class="avatar-image-stub" :src="src" :alt="alt" />',
  }),
  AvatarFallback: defineComponent({
    template: '<span class="avatar-fallback-stub"><slot /></span>',
  }),
}));

// Stub ContextMenu components
vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: defineComponent({ template: '<div class="ctx-menu-stub"><slot /></div>' }),
  ContextMenuTrigger: defineComponent({
    props: ['asChild'],
    template: '<div class="ctx-trigger-stub"><slot /></div>',
  }),
  ContextMenuContent: defineComponent({ template: '<div class="ctx-content-stub"><slot /></div>' }),
  ContextMenuItem: defineComponent({
    template: '<div class="ctx-item-stub" @click="$emit(\'click\')"><slot /></div>',
    emits: ['click'],
  }),
}));

// Stub AlertDialog components
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: defineComponent({
    props: ['open'],
    template: '<div v-if="open" class="alert-dialog-stub"><slot /></div>',
    emits: ['update:open'],
  }),
  AlertDialogContent: defineComponent({
    template: '<div class="alert-content-stub"><slot /></div>',
  }),
  AlertDialogHeader: defineComponent({ template: '<div class="alert-header-stub"><slot /></div>' }),
  AlertDialogFooter: defineComponent({ template: '<div class="alert-footer-stub"><slot /></div>' }),
  AlertDialogTitle: defineComponent({ template: '<div class="alert-title-stub"><slot /></div>' }),
  AlertDialogDescription: defineComponent({
    template: '<div class="alert-description-stub"><slot /></div>',
  }),
  AlertDialogCancel: defineComponent({
    template: '<button class="alert-cancel-stub" @click="$emit(\'click\')"><slot /></button>',
    emits: ['click'],
  }),
  AlertDialogAction: defineComponent({
    template: '<button class="alert-action-stub" @click="$emit(\'click\')"><slot /></button>',
    emits: ['click'],
  }),
}));

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

const alice: UserPresence = {
  id: 'user-001',
  displayName: 'Alice',
  avatarUrl: 'https://example.com/alice.jpg',
  role: 'ViewerCompany',
  isMuted: false,
  userTag: null,
};

const bob: UserPresence = {
  id: 'user-002',
  displayName: 'Bob Smith',
  avatarUrl: null,
  role: 'Admin',
  isMuted: false,
  userTag: { text: 'Staff', color: '#ff0000' },
};

const mutedAlice: UserPresence = { ...alice, isMuted: true };

describe('PresenceList', () => {
  it('shows "Just you for now 👀" when viewers is empty', () => {
    wrapper = mount(PresenceList, { props: { viewers: [], currentUserRole: 'Admin' } });
    expect(wrapper.text()).toContain('Just you for now 👀');
  });

  it('renders one row per viewer', () => {
    wrapper = mount(PresenceList, {
      props: { viewers: [alice, bob], currentUserRole: 'ViewerGuest' },
    });
    const items = wrapper.findAll('li');
    expect(items).toHaveLength(2);
  });

  it('row shows display name', () => {
    wrapper = mount(PresenceList, { props: { viewers: [alice], currentUserRole: 'ViewerGuest' } });
    expect(wrapper.text()).toContain('Alice');
  });

  it('row shows userTag text when userTag is non-null', () => {
    wrapper = mount(PresenceList, { props: { viewers: [bob], currentUserRole: 'ViewerGuest' } });
    expect(wrapper.text()).toContain('Staff');
  });

  it('row does NOT show tag element when userTag is null', () => {
    wrapper = mount(PresenceList, { props: { viewers: [alice], currentUserRole: 'ViewerGuest' } });
    const tagSpans = wrapper.findAll('span[style]');
    expect(tagSpans).toHaveLength(0);
  });

  it('does not show empty state when viewers are present', () => {
    wrapper = mount(PresenceList, { props: { viewers: [alice], currentUserRole: 'ViewerGuest' } });
    expect(wrapper.text()).not.toContain('Just you for now');
  });

  describe('muted indicator', () => {
    it('shows MicOff icon when viewer is muted AND current user is privileged', () => {
      wrapper = mount(PresenceList, { props: { viewers: [mutedAlice], currentUserRole: 'Admin' } });
      expect(wrapper.find('[aria-label="Muted"]').exists()).toBe(true);
    });

    it('does NOT show MicOff icon when viewer is muted but current user is not privileged', () => {
      wrapper = mount(PresenceList, {
        props: { viewers: [mutedAlice], currentUserRole: 'ViewerGuest' },
      });
      expect(wrapper.find('[aria-label="Muted"]').exists()).toBe(false);
    });

    it('does NOT show MicOff icon when viewer is not muted', () => {
      wrapper = mount(PresenceList, { props: { viewers: [alice], currentUserRole: 'Admin' } });
      expect(wrapper.find('[aria-label="Muted"]').exists()).toBe(false);
    });
  });

  describe('context menu — mute/unmute', () => {
    it('shows Mute item (not Unmute) for unmuted viewer when Admin viewing ViewerGuest', () => {
      wrapper = mount(PresenceList, { props: { viewers: [alice], currentUserRole: 'Admin' } });
      expect(wrapper.text()).toContain('Mute');
      expect(wrapper.text()).not.toContain('Unmute');
    });

    it('shows Unmute item (not Mute) for muted viewer when Admin viewing ViewerGuest', () => {
      wrapper = mount(PresenceList, { props: { viewers: [mutedAlice], currentUserRole: 'Admin' } });
      expect(wrapper.text()).toContain('Unmute');
      expect(wrapper.text()).not.toContain('Mute');
    });

    it('does not show context menu when currentUserRole is not privileged', () => {
      wrapper = mount(PresenceList, {
        props: { viewers: [alice, mutedAlice], currentUserRole: 'ViewerGuest' },
      });
      expect(wrapper.text()).not.toContain('Mute');
      expect(wrapper.text()).not.toContain('Unmute');
    });

    it('does not show context menu when Moderator viewing another Moderator (AC 4 — role hierarchy)', () => {
      const moderator: UserPresence = { ...alice, role: 'Moderator' };
      wrapper = mount(PresenceList, {
        props: { viewers: [moderator], currentUserRole: 'Moderator' },
      });
      expect(wrapper.text()).not.toContain('Mute');
      expect(wrapper.text()).not.toContain('Unmute');
    });

    it('does not show context menu when Moderator viewing Admin (AC 4 — role hierarchy)', () => {
      const admin: UserPresence = { ...bob, role: 'Admin' };
      wrapper = mount(PresenceList, {
        props: { viewers: [admin], currentUserRole: 'Moderator' },
      });
      expect(wrapper.text()).not.toContain('Mute');
      expect(wrapper.text()).not.toContain('Unmute');
    });

    it('emits muteUser with viewer id when Mute is clicked', async () => {
      wrapper = mount(PresenceList, { props: { viewers: [alice], currentUserRole: 'Admin' } });
      const items = wrapper.findAll('.ctx-item-stub');
      const muteItem = items.find((el) => el.text() === 'Mute');
      await muteItem!.trigger('click');
      expect(wrapper.emitted('muteUser')).toEqual([['user-001']]);
    });

    it('emits unmuteUser with viewer id when Unmute is clicked', async () => {
      wrapper = mount(PresenceList, { props: { viewers: [mutedAlice], currentUserRole: 'Admin' } });
      const items = wrapper.findAll('.ctx-item-stub');
      const unmuteItem = items.find((el) => el.text() === 'Unmute');
      await unmuteItem!.trigger('click');
      expect(wrapper.emitted('unmuteUser')).toEqual([['user-001']]);
    });

    it('shows Ban item for any viewer when Admin viewing ViewerGuest', () => {
      wrapper = mount(PresenceList, { props: { viewers: [alice], currentUserRole: 'Admin' } });
      expect(wrapper.text()).toContain('Ban');
    });

    it('clicking Ban opens AlertDialog', async () => {
      wrapper = mount(PresenceList, { props: { viewers: [alice], currentUserRole: 'Admin' } });
      const banItem = wrapper.findAll('.ctx-item-stub').find((el) => el.text() === 'Ban');
      await banItem!.trigger('click');
      expect(wrapper.find('.alert-dialog-stub').exists()).toBe(true);
      expect(wrapper.find('.alert-title-stub').text()).toContain('Ban Alice?');
    });

    it('clicking Ban action in AlertDialog emits banUser and closes dialog', async () => {
      wrapper = mount(PresenceList, { props: { viewers: [alice], currentUserRole: 'Admin' } });
      await wrapper
        .findAll('.ctx-item-stub')
        .find((el) => el.text() === 'Ban')!
        .trigger('click');

      const actionBtn = wrapper.find('.alert-action-stub');
      await actionBtn.trigger('click');

      expect(wrapper.emitted('banUser')).toEqual([['user-001']]);
      expect(wrapper.find('.alert-dialog-stub').exists()).toBe(false);
    });

    it('does not show Mute/Unmute/Ban for the current user (self)', () => {
      // Create a lower-privileged viewer that admin alice can mute
      const lowPrivilegedBob: UserPresence = { ...bob, role: 'ViewerCompany' };
      wrapper = mount(PresenceList, {
        props: {
          viewers: [alice, lowPrivilegedBob],
          currentUserRole: 'Admin',
          currentUserId: 'user-001',
        },
      });
      // alice is currentUser — should have no mute/ban options; lowPrivilegedBob should have them
      const items = wrapper.findAll('.ctx-item-stub');
      // Only lowPrivilegedBob's items should appear: Mute + Ban
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.text())).toContain('Mute');
      expect(items.map((i) => i.text())).toContain('Ban');
    });
  });
});
