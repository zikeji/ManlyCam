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
  userTag: null,
};

const bob: UserPresence = {
  id: 'user-002',
  displayName: 'Bob Smith',
  avatarUrl: null,
  role: 'Admin',
  userTag: { text: 'Staff', color: '#ff0000' },
};

describe('PresenceList', () => {
  it('shows "Just you for now 👀" when viewers is empty', () => {
    wrapper = mount(PresenceList, { props: { viewers: [] } });
    expect(wrapper.text()).toContain('Just you for now 👀');
  });

  it('renders one row per viewer', () => {
    wrapper = mount(PresenceList, { props: { viewers: [alice, bob] } });
    const items = wrapper.findAll('li');
    expect(items).toHaveLength(2);
  });

  it('row shows display name', () => {
    wrapper = mount(PresenceList, { props: { viewers: [alice] } });
    expect(wrapper.text()).toContain('Alice');
  });

  it('row shows userTag text when userTag is non-null', () => {
    wrapper = mount(PresenceList, { props: { viewers: [bob] } });
    expect(wrapper.text()).toContain('Staff');
  });

  it('row does NOT show tag element when userTag is null', () => {
    wrapper = mount(PresenceList, { props: { viewers: [alice] } });
    // Alice has no userTag — the span with border styling should not be present
    const tagSpans = wrapper.findAll('span[style]');
    expect(tagSpans).toHaveLength(0);
  });

  it('does not show empty state when viewers are present', () => {
    wrapper = mount(PresenceList, { props: { viewers: [alice] } });
    expect(wrapper.text()).not.toContain('Just you for now');
  });
});
