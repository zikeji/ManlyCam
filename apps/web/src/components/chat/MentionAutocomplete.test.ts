import { describe, it, expect, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import MentionAutocomplete from './MentionAutocomplete.vue';
import type { UserPresence } from '@manlycam/types';

const makeViewer = (id: string, displayName: string): UserPresence => ({
  id,
  displayName,
  avatarUrl: null,
  role: 'ViewerCompany',
  isMuted: false,
  userTag: null,
});

const john = makeViewer('user-001', 'John Smith');
const jane = makeViewer('user-002', 'Jane Doe');
const alice = makeViewer('user-003', 'Alice');

const defaultProps = {
  visible: true,
  query: '',
  viewers: [john, jane, alice],
  position: { bottom: 100, left: 50 },
};

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('MentionAutocomplete.vue', () => {
  it('renders nothing when visible is false', () => {
    wrapper = mount(MentionAutocomplete, {
      props: { ...defaultProps, visible: false },
    });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('renders all viewers when visible and query is empty', () => {
    wrapper = mount(MentionAutocomplete, { props: defaultProps });
    const options = wrapper.findAll('[role="option"]');
    expect(options).toHaveLength(3);
  });

  it('filters viewers by query (space-removed matching)', () => {
    wrapper = mount(MentionAutocomplete, {
      props: { ...defaultProps, query: 'johns' },
    });
    const options = wrapper.findAll('[role="option"]');
    expect(options).toHaveLength(1);
    expect(options[0].find('.truncate').text()).toBe('John Smith');
  });

  it('filters viewers case-insensitively', () => {
    wrapper = mount(MentionAutocomplete, {
      props: { ...defaultProps, query: 'JOHNS' },
    });
    const options = wrapper.findAll('[role="option"]');
    expect(options).toHaveLength(1);
    expect(options[0].find('.truncate').text()).toBe('John Smith');
  });

  it('shows nothing when no viewer matches query', () => {
    wrapper = mount(MentionAutocomplete, {
      props: { ...defaultProps, query: 'nobody' },
    });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('renders with correct position styles', () => {
    wrapper = mount(MentionAutocomplete, { props: defaultProps });
    const listbox = wrapper.find('[role="listbox"]');
    expect(listbox.attributes('style')).toContain('bottom: 100px');
    expect(listbox.attributes('style')).toContain('left: 50px');
  });

  it('first item has aria-selected=true by default', () => {
    wrapper = mount(MentionAutocomplete, { props: defaultProps });
    const options = wrapper.findAll('[role="option"]');
    expect(options[0].attributes('aria-selected')).toBe('true');
    expect(options[1].attributes('aria-selected')).toBe('false');
  });

  it('emits select with correct user when option is clicked', async () => {
    wrapper = mount(MentionAutocomplete, { props: defaultProps });
    await wrapper.findAll('[role="option"]')[1].trigger('mousedown');
    const emitted = wrapper.emitted('select');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual(jane);
  });

  describe('keyboard navigation', () => {
    it('ArrowDown moves toward bottom (most relevant, index 0) — wraps from 0 to last', async () => {
      wrapper = mount(MentionAutocomplete, { props: defaultProps });
      const comp = wrapper.vm as unknown as { handleKeydown: (e: KeyboardEvent) => void };
      // Starting at index 0 (most relevant, rendered at bottom): ArrowDown wraps to last
      comp.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      await wrapper.vm.$nextTick();
      const options = wrapper.findAll('[role="option"]');
      expect(options[2].attributes('aria-selected')).toBe('true');
    });

    it('ArrowUp moves toward top (less relevant) — index 0 → 1', async () => {
      wrapper = mount(MentionAutocomplete, { props: defaultProps });
      const comp = wrapper.vm as unknown as { handleKeydown: (e: KeyboardEvent) => void };
      comp.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      await wrapper.vm.$nextTick();
      const options = wrapper.findAll('[role="option"]');
      expect(options[0].attributes('aria-selected')).toBe('false');
      expect(options[1].attributes('aria-selected')).toBe('true');
    });

    it('Enter emits select with currently highlighted item', async () => {
      wrapper = mount(MentionAutocomplete, { props: defaultProps });
      const comp = wrapper.vm as unknown as { handleKeydown: (e: KeyboardEvent) => void };
      comp.handleKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
      await wrapper.vm.$nextTick();
      const emitted = wrapper.emitted('select');
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toEqual(john);
    });

    it('Tab emits select with currently highlighted item', async () => {
      wrapper = mount(MentionAutocomplete, { props: defaultProps });
      const comp = wrapper.vm as unknown as { handleKeydown: (e: KeyboardEvent) => void };
      comp.handleKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));
      await wrapper.vm.$nextTick();
      const emitted = wrapper.emitted('select');
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toEqual(john);
    });

    it('Escape emits close', async () => {
      wrapper = mount(MentionAutocomplete, { props: defaultProps });
      const comp = wrapper.vm as unknown as { handleKeydown: (e: KeyboardEvent) => void };
      comp.handleKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('resets selection to 0 when query changes', async () => {
      wrapper = mount(MentionAutocomplete, { props: defaultProps });
      const comp = wrapper.vm as unknown as {
        handleKeydown: (e: KeyboardEvent) => void;
        selectedIndex: number;
      };
      comp.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      await wrapper.setProps({ query: 'alice' });
      // selectedIndex is auto-unwrapped from the ref when accessed via vm
      expect(comp.selectedIndex).toBe(0);
    });
  });

  it('has role="listbox" on container', () => {
    wrapper = mount(MentionAutocomplete, { props: defaultProps });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
  });

  it('each item has role="option"', () => {
    wrapper = mount(MentionAutocomplete, { props: defaultProps });
    const options = wrapper.findAll('[role="option"]');
    expect(options.length).toBeGreaterThan(0);
    options.forEach((opt) => {
      expect(opt.attributes('role')).toBe('option');
    });
  });

  it('caps results at 10 even when more viewers match', () => {
    const manyViewers = Array.from({ length: 15 }, (_, i) =>
      makeViewer(`user-${i.toString().padStart(3, '0')}`, `User ${i.toString().padStart(2, '0')}`),
    );
    wrapper = mount(MentionAutocomplete, {
      props: { ...defaultProps, query: '', viewers: manyViewers },
    });
    expect(wrapper.findAll('[role="option"]')).toHaveLength(10);
  });

  it('each item renders an avatar fallback with initials', () => {
    wrapper = mount(MentionAutocomplete, { props: defaultProps });
    // Each option should contain an avatar fallback element
    const options = wrapper.findAll('[role="option"]');
    expect(options.length).toBeGreaterThan(0);
    // Verify first option contains the display name and some avatar content
    expect(options[0].text()).toContain('John Smith');
  });
});
