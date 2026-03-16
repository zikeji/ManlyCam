import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import ReactionDisplay from './ReactionDisplay.vue';
import type { Reaction } from '@manlycam/types';

vi.mock('@/lib/emoji-data', () => ({
  EMOJI_MAP: new Map([
    ['thumbs_up', { name: 'thumbs_up', codepoint: '1f44d', keywords: [], category: 'people' }],
    ['red_heart', { name: 'red_heart', codepoint: '2764-fe0f', keywords: [], category: 'smileys' }],
  ]),
  getEmojiUrl: (codepoint: string) => `/emojis/${codepoint}.svg`,
}));

const makeReaction = (overrides: Partial<Reaction> = {}): Reaction => ({
  emoji: 'thumbs_up',
  count: 1,
  userReacted: false,
  userIds: ['user-other'],
  userDisplayNames: ['Other User'],
  userRoles: ['ViewerGuest' as const],
  firstReactedAt: new Date().toISOString(),
  ...overrides,
});

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('ReactionDisplay.vue', () => {
  it('renders nothing when reactions array is empty', () => {
    wrapper = mount(ReactionDisplay, {
      props: { reactions: [], currentUserId: 'user-001' },
    });
    expect(wrapper.find('[role="group"]').exists()).toBe(false);
  });

  it('renders reaction badges for each reaction', () => {
    const reactions = [
      makeReaction({
        emoji: 'thumbs_up',
        count: 3,
        userIds: ['u1', 'u2', 'u3'],
        userDisplayNames: ['U1', 'U2', 'U3'],
      }),
      makeReaction({ emoji: 'red_heart', count: 1, userIds: ['u1'], userDisplayNames: ['U1'] }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-other' },
    });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(2);
  });

  it('displays reaction count', () => {
    const reactions = [
      makeReaction({
        emoji: 'thumbs_up',
        count: 5,
        userIds: ['u1', 'u2', 'u3', 'u4', 'u5'],
        userDisplayNames: ['U1', 'U2', 'U3', 'U4', 'U5'],
      }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-none' },
    });
    expect(wrapper.text()).toContain('5');
  });

  it('highlights reaction when currentUserId is in userIds', () => {
    const reactions = [
      makeReaction({
        emoji: 'thumbs_up',
        count: 2,
        userIds: ['user-001', 'user-002'],
        userDisplayNames: ['User 1', 'User 2'],
      }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001' },
    });
    const btn = wrapper.find('button');
    expect(btn.classes().some((c) => c.includes('primary'))).toBe(true);
  });

  it('does NOT highlight when currentUserId is not in userIds', () => {
    const reactions = [
      makeReaction({
        emoji: 'thumbs_up',
        count: 1,
        userIds: ['other-user'],
        userDisplayNames: ['Other User'],
      }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001' },
    });
    const btn = wrapper.find('button');
    expect(btn.classes().some((c) => c.includes('primary'))).toBe(false);
  });

  it('emits toggle event when reaction badge is clicked', async () => {
    const reactions = [
      makeReaction({ emoji: 'thumbs_up', count: 1, userIds: ['u1'], userDisplayNames: ['U1'] }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001' },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('toggle')).toBeTruthy();
    expect(wrapper.emitted('toggle')![0]).toEqual(['thumbs_up']);
  });

  it('does NOT emit toggle when isMuted=true', async () => {
    const reactions = [
      makeReaction({ emoji: 'thumbs_up', count: 1, userIds: ['u1'], userDisplayNames: ['U1'] }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001', isMuted: true },
    });
    // Button is disabled for muted users
    const btn = wrapper.find('button');
    expect(btn.element.disabled).toBe(true);
  });

  it('has aria-label with count for accessibility', () => {
    const reactions = [
      makeReaction({
        emoji: 'thumbs_up',
        count: 3,
        userIds: ['u1', 'u2', 'u3'],
        userDisplayNames: ['U1', 'U2', 'U3'],
      }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001' },
    });
    const btn = wrapper.find('button');
    expect(btn.attributes('aria-label')).toContain('3');
  });

  it('applies pointer-events-none class when isMuted=true', () => {
    const reactions = [makeReaction({ count: 1, userIds: ['u1'], userDisplayNames: ['U1'] })];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001', isMuted: true },
    });
    const btn = wrapper.find('button');
    expect(btn.classes()).toContain('pointer-events-none');
  });

  it('opens detail panel on contextmenu event', async () => {
    const reactions = [
      makeReaction({ count: 1, userIds: ['target-user'], userDisplayNames: ['Target User'] }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001' },
      attachTo: document.body,
    });
    await wrapper.find('[role="group"]').trigger('contextmenu');
    // Detail panel should exist in document body via Teleport
    expect(document.querySelector('[data-reaction-detail-panel]')).not.toBeNull();
    document.querySelector('[data-reaction-detail-panel]')?.remove();
  });

  it('detail panel shows display names for reactors', async () => {
    const reactions = [
      makeReaction({ count: 2, userIds: ['u1', 'u2'], userDisplayNames: ['Alice', 'Bob'] }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001' },
      attachTo: document.body,
    });
    await wrapper.find('[role="group"]').trigger('contextmenu');
    const panel = document.querySelector('[data-reaction-detail-panel]');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('Alice');
    expect(panel!.textContent).toContain('Bob');
    panel?.remove();
  });

  it('shows mod × button in detail panel when canModerate=true and mod outranks reactor', async () => {
    const reactions = [
      makeReaction({
        count: 1,
        userIds: ['target-user'],
        userDisplayNames: ['Target User'],
        userRoles: ['ViewerGuest' as const],
      }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: {
        reactions,
        currentUserId: 'user-001',
        currentUserRole: 'Moderator',
        canModerate: true,
      },
      attachTo: document.body,
    });
    await wrapper.find('[role="group"]').trigger('contextmenu');
    const panel = document.querySelector('[data-reaction-detail-panel]');
    expect(panel).not.toBeNull();
    const modBtn = panel!.querySelector('button[aria-label*="Remove"]');
    expect(modBtn).not.toBeNull();
    panel?.remove();
  });

  it("hides mod × button for the current user's own reaction", async () => {
    const reactions = [
      makeReaction({
        count: 1,
        userIds: ['user-001'],
        userDisplayNames: ['Me'],
        userRoles: ['ViewerGuest' as const],
      }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: {
        reactions,
        currentUserId: 'user-001',
        currentUserRole: 'Moderator',
        canModerate: true,
      },
      attachTo: document.body,
    });
    await wrapper.find('[role="group"]').trigger('contextmenu');
    const panel = document.querySelector('[data-reaction-detail-panel]');
    expect(panel).not.toBeNull();
    const modBtn = panel!.querySelector('button[aria-label*="Remove"]');
    expect(modBtn).toBeNull();
    panel?.remove();
  });

  it('hides mod × button when currentUserRole is not provided', async () => {
    const reactions = [
      makeReaction({
        count: 1,
        userIds: ['target-user'],
        userDisplayNames: ['Target'],
        userRoles: ['ViewerGuest' as const],
      }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001', canModerate: true }, // no currentUserRole
      attachTo: document.body,
    });
    await wrapper.find('[role="group"]').trigger('contextmenu');
    const panel = document.querySelector('[data-reaction-detail-panel]');
    expect(panel!.querySelector('button[aria-label*="Remove"]')).toBeNull();
    panel?.remove();
  });

  it('hides mod × button when reactor role data is missing', async () => {
    const reactions = [
      makeReaction({
        count: 1,
        userIds: ['target-user'],
        userDisplayNames: ['Target'],
        userRoles: undefined as unknown as [],
      }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: {
        reactions,
        currentUserId: 'user-001',
        currentUserRole: 'Moderator',
        canModerate: true,
      },
      attachTo: document.body,
    });
    await wrapper.find('[role="group"]').trigger('contextmenu');
    const panel = document.querySelector('[data-reaction-detail-panel]');
    expect(panel!.querySelector('button[aria-label*="Remove"]')).toBeNull();
    panel?.remove();
  });

  it('hides mod × button for reactors with equal or higher role', async () => {
    const reactions = [
      makeReaction({
        count: 1,
        userIds: ['other-mod'],
        userDisplayNames: ['Other Mod'],
        userRoles: ['Moderator'],
      }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: {
        reactions,
        currentUserId: 'user-001',
        currentUserRole: 'Moderator',
        canModerate: true,
      },
      attachTo: document.body,
    });
    await wrapper.find('[role="group"]').trigger('contextmenu');
    const panel = document.querySelector('[data-reaction-detail-panel]');
    expect(panel).not.toBeNull();
    const modBtn = panel!.querySelector('button[aria-label*="Remove"]');
    expect(modBtn).toBeNull();
    panel?.remove();
  });

  it('does NOT show mod × button when canModerate=false', async () => {
    const reactions = [
      makeReaction({ count: 1, userIds: ['target-user'], userDisplayNames: ['Target User'] }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001', canModerate: false },
      attachTo: document.body,
    });
    await wrapper.find('[role="group"]').trigger('contextmenu');
    const panel = document.querySelector('[data-reaction-detail-panel]');
    expect(panel).not.toBeNull();
    const modBtn = panel!.querySelector('button[aria-label*="Remove"]');
    expect(modBtn).toBeNull();
    panel?.remove();
  });

  it('emits modRemove when mod × button is clicked in detail panel', async () => {
    const reactions = [
      makeReaction({
        count: 1,
        userIds: ['target-user'],
        userDisplayNames: ['Target User'],
        userRoles: ['ViewerGuest' as const],
      }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: {
        reactions,
        currentUserId: 'user-001',
        currentUserRole: 'Moderator',
        canModerate: true,
      },
      attachTo: document.body,
    });
    await wrapper.find('[role="group"]').trigger('contextmenu');
    const panel = document.querySelector('[data-reaction-detail-panel]');
    const modBtn = panel!.querySelector('button[aria-label*="Remove"]') as HTMLElement;
    modBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.emitted('modRemove')).toBeTruthy();
    expect(wrapper.emitted('modRemove')![0]).toEqual(['thumbs_up', 'target-user']);
    document.querySelector('[data-reaction-detail-panel]')?.remove();
  });

  it('falls back to text span when emoji has no URL', () => {
    // 'unknown_emoji' is not in the mock EMOJI_MAP so getEmojiUrl returns ''
    const reactions = [
      makeReaction({ emoji: 'unknown_emoji', count: 1, userIds: ['u1'], userDisplayNames: ['U1'] }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001' },
    });
    // Should render the fallback span instead of an img
    expect(wrapper.find('span.text-xs').exists()).toBe(true);
    expect(wrapper.find('span.text-xs').text()).toBe('unknown_emoji');
  });

  it('falls back to text span in detail panel when emoji has no URL', async () => {
    const reactions = [
      makeReaction({ emoji: 'unknown_emoji', count: 1, userIds: ['u1'], userDisplayNames: ['U1'] }),
    ];
    wrapper = mount(ReactionDisplay, {
      props: { reactions, currentUserId: 'user-001' },
      attachTo: document.body,
    });
    await wrapper.find('[role="group"]').trigger('contextmenu');
    const panel = document.querySelector('[data-reaction-detail-panel]');
    expect(panel).not.toBeNull();
    // Fallback span in detail panel
    const spans = panel!.querySelectorAll('span.text-sm');
    expect(spans.length).toBeGreaterThan(0);
    panel?.remove();
  });
});
