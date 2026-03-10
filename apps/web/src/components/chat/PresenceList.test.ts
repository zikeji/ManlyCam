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
    wrapper = mount(PresenceList, { props: { viewers: [], canMuteUsers: false } });
    expect(wrapper.text()).toContain('Just you for now 👀');
  });

  it('renders one row per viewer', () => {
    wrapper = mount(PresenceList, { props: { viewers: [alice, bob], canMuteUsers: false } });
    const items = wrapper.findAll('li');
    expect(items).toHaveLength(2);
  });

  it('row shows display name', () => {
    wrapper = mount(PresenceList, { props: { viewers: [alice], canMuteUsers: false } });
    expect(wrapper.text()).toContain('Alice');
  });

  it('row shows userTag text when userTag is non-null', () => {
    wrapper = mount(PresenceList, { props: { viewers: [bob], canMuteUsers: false } });
    expect(wrapper.text()).toContain('Staff');
  });

  it('row does NOT show tag element when userTag is null', () => {
    wrapper = mount(PresenceList, { props: { viewers: [alice], canMuteUsers: false } });
    const tagSpans = wrapper.findAll('span[style]');
    expect(tagSpans).toHaveLength(0);
  });

  it('does not show empty state when viewers are present', () => {
    wrapper = mount(PresenceList, { props: { viewers: [alice], canMuteUsers: false } });
    expect(wrapper.text()).not.toContain('Just you for now');
  });

  describe('muted indicator', () => {
    it('shows MicOff icon when viewer is muted AND canMuteUsers is true', () => {
      wrapper = mount(PresenceList, { props: { viewers: [mutedAlice], canMuteUsers: true } });
      expect(wrapper.find('[aria-label="Muted"]').exists()).toBe(true);
    });

    it('does NOT show MicOff icon when viewer is muted but canMuteUsers is false', () => {
      wrapper = mount(PresenceList, { props: { viewers: [mutedAlice], canMuteUsers: false } });
      expect(wrapper.find('[aria-label="Muted"]').exists()).toBe(false);
    });

    it('does NOT show MicOff icon when viewer is not muted', () => {
      wrapper = mount(PresenceList, { props: { viewers: [alice], canMuteUsers: true } });
      expect(wrapper.find('[aria-label="Muted"]').exists()).toBe(false);
    });
  });

  describe('context menu — mute/unmute', () => {
    it('shows Mute item (not Unmute) for unmuted viewer when canMuteUsers is true', () => {
      wrapper = mount(PresenceList, { props: { viewers: [alice], canMuteUsers: true } });
      expect(wrapper.text()).toContain('Mute');
      expect(wrapper.text()).not.toContain('Unmute');
    });

    it('shows Unmute item (not Mute) for muted viewer when canMuteUsers is true', () => {
      wrapper = mount(PresenceList, { props: { viewers: [mutedAlice], canMuteUsers: true } });
      expect(wrapper.text()).toContain('Unmute');
      expect(wrapper.text()).not.toContain('Mute');
    });

    it('does not show Mute/Unmute when canMuteUsers is false', () => {
      wrapper = mount(PresenceList, {
        props: { viewers: [alice, mutedAlice], canMuteUsers: false },
      });
      expect(wrapper.text()).not.toContain('Mute');
      expect(wrapper.text()).not.toContain('Unmute');
    });

    it('emits muteUser with viewer id when Mute is clicked', async () => {
      wrapper = mount(PresenceList, { props: { viewers: [alice], canMuteUsers: true } });
      const items = wrapper.findAll('.ctx-item-stub');
      const muteItem = items.find((el) => el.text() === 'Mute');
      await muteItem!.trigger('click');
      expect(wrapper.emitted('muteUser')).toEqual([['user-001']]);
    });

    it('emits unmuteUser with viewer id when Unmute is clicked', async () => {
      wrapper = mount(PresenceList, { props: { viewers: [mutedAlice], canMuteUsers: true } });
      const items = wrapper.findAll('.ctx-item-stub');
      const unmuteItem = items.find((el) => el.text() === 'Unmute');
      await unmuteItem!.trigger('click');
      expect(wrapper.emitted('unmuteUser')).toEqual([['user-001']]);
    });

    it('does not show Mute/Unmute for the current user (self)', () => {
      wrapper = mount(PresenceList, {
        props: { viewers: [alice, bob], canMuteUsers: true, currentUserId: 'user-001' },
      });
      // alice is currentUser — should have no mute option; bob should still have it
      const items = wrapper.findAll('.ctx-item-stub');
      // Only bob's mute item should appear
      expect(items).toHaveLength(1);
      expect(items[0].text()).toBe('Mute');
    });
  });
});
