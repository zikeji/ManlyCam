import { describe, it, expect, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import TypingIndicator from './TypingIndicator.vue';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function makeUsers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    userId: `user-${i + 1}`,
    displayName: `User ${i + 1}`,
  }));
}

describe('TypingIndicator', () => {
  it('renders the container but no content when typingUsers is empty', () => {
    wrapper = mount(TypingIndicator, { props: { typingUsers: [] } });
    // Outer container always rendered (reserves space permanently)
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true);
    // But inner content is absent
    expect(wrapper.text()).toBe('');
    expect(wrapper.find('.typing-dot').exists()).toBe(false);
  });

  it('shows "{displayName} is typing" for 1 typer', () => {
    wrapper = mount(TypingIndicator, {
      props: { typingUsers: [{ userId: 'u1', displayName: 'Alice' }] },
    });
    expect(wrapper.text()).toContain('Alice is typing');
  });

  it('shows "{Name1} and {Name2} are typing" for 2 typers', () => {
    wrapper = mount(TypingIndicator, {
      props: {
        typingUsers: [
          { userId: 'u1', displayName: 'Alice' },
          { userId: 'u2', displayName: 'Bob' },
        ],
      },
    });
    expect(wrapper.text()).toContain('Alice and Bob are typing');
  });

  it('shows "Several people are typing" for 3+ typers', () => {
    wrapper = mount(TypingIndicator, { props: { typingUsers: makeUsers(3) } });
    expect(wrapper.text()).toContain('Several people are typing');
  });

  it('container has aria-live="polite"', () => {
    wrapper = mount(TypingIndicator, {
      props: { typingUsers: [{ userId: 'u1', displayName: 'Alice' }] },
    });
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true);
  });

  it('renders three dot spans when typingUsers > 0', () => {
    wrapper = mount(TypingIndicator, {
      props: { typingUsers: [{ userId: 'u1', displayName: 'Alice' }] },
    });
    const dots = wrapper.findAll('.typing-dot');
    expect(dots).toHaveLength(3);
  });

  it('dot spans container has aria-hidden="true"', () => {
    wrapper = mount(TypingIndicator, {
      props: { typingUsers: [{ userId: 'u1', displayName: 'Alice' }] },
    });
    expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(true);
  });
});
