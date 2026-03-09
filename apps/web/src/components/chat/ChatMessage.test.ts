import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChatMessage from './ChatMessage.vue';
import type { ChatMessage as ChatMessageType } from '@manlycam/types';

const baseMessage: ChatMessageType = {
  id: 'msg-001',
  userId: 'user-001',
  displayName: 'Test User',
  avatarUrl: null,
  content: 'Hello world',
  editHistory: null,
  updatedAt: null,
  deletedAt: null,
  deletedBy: null,
  createdAt: '2026-03-08T10:00:00.000Z',
  userTag: null,
};

describe('ChatMessage.vue', () => {
  it('renders with role="listitem"', () => {
    const wrapper = mount(ChatMessage, { props: { message: baseMessage } });
    expect(wrapper.find('[role="listitem"]').exists()).toBe(true);
  });

  it('renders display name', () => {
    const wrapper = mount(ChatMessage, { props: { message: baseMessage } });
    expect(wrapper.text()).toContain('Test User');
  });

  it('renders message content', () => {
    const wrapper = mount(ChatMessage, { props: { message: baseMessage } });
    expect(wrapper.text()).toContain('Hello world');
  });

  it('renders avatar fallback initials (first letter of each word)', () => {
    const wrapper = mount(ChatMessage, { props: { message: baseMessage } });
    // "Test User" → T + U = "TU"
    expect(wrapper.text()).toContain('TU');
  });

  it('renders avatar image when avatarUrl is set', () => {
    const wrapper = mount(ChatMessage, {
      props: { message: { ...baseMessage, avatarUrl: 'https://example.com/avatar.jpg' } },
    });
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/avatar.jpg');
  });

  it('renders bold markdown', () => {
    const wrapper = mount(ChatMessage, {
      props: { message: { ...baseMessage, content: '**bold text**' } },
    });
    expect(wrapper.find('strong').exists()).toBe(true);
    expect(wrapper.find('strong').text()).toBe('bold text');
  });

  it('renders inline code markdown', () => {
    const wrapper = mount(ChatMessage, {
      props: { message: { ...baseMessage, content: '`code here`' } },
    });
    expect(wrapper.find('code').exists()).toBe(true);
    expect(wrapper.find('code').text()).toBe('code here');
  });

  it('renders link markdown with target=_blank', () => {
    const wrapper = mount(ChatMessage, {
      props: { message: { ...baseMessage, content: '[click here](https://example.com)' } },
    });
    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('https://example.com');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
  });

  it('suppresses javascript: URLs in links', () => {
    const wrapper = mount(ChatMessage, {
      props: { message: { ...baseMessage, content: '[bad](javascript:alert(1))' } },
    });
    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('#');
    expect(link.attributes('href')).not.toContain('javascript:');
  });

  it('renders userTag when present', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        message: {
          ...baseMessage,
          userTag: { text: 'VIP', color: '#FF0000' },
        },
      },
    });
    expect(wrapper.text()).toContain('VIP');
  });

  it('does not render userTag when null', () => {
    const wrapper = mount(ChatMessage, { props: { message: baseMessage } });
    expect(wrapper.text()).not.toContain('Guest');
    expect(wrapper.text()).not.toContain('VIP');
  });

  describe('isContinuation=true (continuation row)', () => {
    it('does not render Avatar when isContinuation is true', () => {
      const wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: true },
      });
      // Avatar component wraps an element; if continuation, no avatar wrapper present
      const avatarEl = wrapper.find('.h-8.w-8');
      expect(avatarEl.exists()).toBe(false);
    });

    it('does not render display name when isContinuation is true', () => {
      const wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, displayName: 'UniqueNameXYZ' }, isContinuation: true },
      });
      expect(wrapper.text()).not.toContain('UniqueNameXYZ');
    });

    it('does not render userTag pill when isContinuation is true', () => {
      const wrapper = mount(ChatMessage, {
        props: {
          message: { ...baseMessage, userTag: { text: 'VIP', color: '#FF0000' } },
          isContinuation: true,
        },
      });
      expect(wrapper.text()).not.toContain('VIP');
    });

    it('renders message body when isContinuation is true', () => {
      const wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, content: 'Continuation text' }, isContinuation: true },
      });
      expect(wrapper.text()).toContain('Continuation text');
    });

    it('root element has pl-[52px] class when isContinuation is true', () => {
      const wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: true },
      });
      const root = wrapper.find('[role="listitem"]');
      expect(root.classes().join(' ')).toContain('pl-[52px]');
    });
  });

  describe('isContinuation=false (explicit group header)', () => {
    it('renders Avatar when isContinuation is false', () => {
      const wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: false },
      });
      const avatarEl = wrapper.find('.h-8.w-8');
      expect(avatarEl.exists()).toBe(true);
    });

    it('renders display name when isContinuation is false', () => {
      const wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: false },
      });
      expect(wrapper.text()).toContain('Test User');
    });

    it('renders timestamp when isContinuation is false', () => {
      const wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: false },
      });
      // timeLabel is a formatted time string — just verify some text present in muted span
      const timeSpan = wrapper.find('.text-muted-foreground.shrink-0');
      expect(timeSpan.exists()).toBe(true);
    });
  });
});
