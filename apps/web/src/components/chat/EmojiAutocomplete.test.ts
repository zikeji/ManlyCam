import { describe, it, expect, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import EmojiAutocomplete from './EmojiAutocomplete.vue';

let wrapper: VueWrapper | null = null;

const defaultPosition = { bottom: 100, left: 50 };

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('EmojiAutocomplete.vue', () => {
  it('does not render when visible=false', () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: false, query: 'smile', position: defaultPosition },
    });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('does not render when query has no results', () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'xyznotamoji999', position: defaultPosition },
    });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('renders when visible=true with matching query', () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'smile', position: defaultPosition },
    });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
  });

  it('has aria-label "Emoji suggestions"', () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'smile', position: defaultPosition },
    });
    expect(wrapper.find('[role="listbox"]').attributes('aria-label')).toBe('Emoji suggestions');
  });

  it('renders list items with emoji images and names', () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'smile', position: defaultPosition },
    });
    const options = wrapper.findAll('[role="option"]');
    expect(options.length).toBeGreaterThan(0);

    for (const option of options) {
      expect(option.find('img').exists()).toBe(true);
      expect(option.find('span').text()).toMatch(/^:.+:$/);
    }
  });

  it('emoji images have src pointing to self-hosted /emojis/ path', () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'smile', position: defaultPosition },
    });
    const img = wrapper.find('[role="option"] img');
    expect(img.attributes('src')).toContain('/emojis/');
  });

  it('limits results to 10', () => {
    // 'a' matches many emojis
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'a', position: defaultPosition },
    });
    const options = wrapper.findAll('[role="option"]');
    expect(options.length).toBeLessThanOrEqual(10);
  });

  it('positions popup using style bottom/left from position prop', () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'smile', position: { bottom: 150, left: 75 } },
    });
    const listbox = wrapper.find('[role="listbox"]');
    expect(listbox.attributes('style')).toContain('bottom: 150px');
    expect(listbox.attributes('style')).toContain('left: 75px');
  });

  it('first option is highlighted (aria-selected=true)', () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'smile', position: defaultPosition },
    });
    const options = wrapper.findAll('[role="option"]');
    expect(options[0].attributes('aria-selected')).toBe('true');
  });

  it('emits select event when option is clicked', async () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'smile', position: defaultPosition },
    });
    await wrapper.find('[role="option"]').trigger('mousedown');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0].length).toBe(1);
  });

  it('emitted select contains emoji with name and codepoint', async () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'smile', position: defaultPosition },
    });
    await wrapper.find('[role="option"]').trigger('mousedown');
    const emittedEmoji = wrapper.emitted('select')![0][0] as { name: string; codepoint: string };
    expect(emittedEmoji.name).toBeTruthy();
    expect(emittedEmoji.codepoint).toBeTruthy();
  });

  describe('keyboard navigation', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getComp = (w: VueWrapper) => w.vm as any;

    it('ArrowDown moves highlight down', async () => {
      wrapper = mount(EmojiAutocomplete, {
        props: { visible: true, query: 'smile', position: defaultPosition },
      });
      const comp = getComp(wrapper);
      expect(comp.highlightedIndex).toBe(0);

      comp.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      await nextTick();
      expect(comp.highlightedIndex).toBe(1);
    });

    it('ArrowUp moves highlight up (wraps around)', async () => {
      wrapper = mount(EmojiAutocomplete, {
        props: { visible: true, query: 'smile', position: defaultPosition },
      });
      const comp = getComp(wrapper);
      expect(comp.highlightedIndex).toBe(0);

      comp.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      await nextTick();
      // Should wrap to last item
      expect(comp.highlightedIndex).toBe(comp.filteredEmojis.length - 1);
    });

    it('Enter emits select for highlighted emoji', async () => {
      wrapper = mount(EmojiAutocomplete, {
        props: { visible: true, query: 'smile', position: defaultPosition },
      });
      getComp(wrapper).handleKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
      await nextTick();
      expect(wrapper.emitted('select')).toBeTruthy();
    });

    it('Tab emits select for highlighted emoji', async () => {
      wrapper = mount(EmojiAutocomplete, {
        props: { visible: true, query: 'smile', position: defaultPosition },
      });
      getComp(wrapper).handleKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));
      await nextTick();
      expect(wrapper.emitted('select')).toBeTruthy();
    });

    it('Escape emits close', async () => {
      wrapper = mount(EmojiAutocomplete, {
        props: { visible: true, query: 'smile', position: defaultPosition },
      });
      getComp(wrapper).handleKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
      await nextTick();
      expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('does nothing when visible=false', async () => {
      wrapper = mount(EmojiAutocomplete, {
        props: { visible: false, query: 'smile', position: defaultPosition },
      });
      getComp(wrapper).handleKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
      await nextTick();
      expect(wrapper.emitted('select')).toBeFalsy();
      expect(wrapper.emitted('close')).toBeFalsy();
    });
  });

  it('resets highlight when query changes', async () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'smile', position: defaultPosition },
    });
    const comp = wrapper.vm as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    comp.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await nextTick();
    expect(comp.highlightedIndex).toBe(1);

    await wrapper.setProps({ query: 'joy' });
    await nextTick();
    expect(comp.highlightedIndex).toBe(0);
  });

  it('resets highlight when visibility changes', async () => {
    wrapper = mount(EmojiAutocomplete, {
      props: { visible: true, query: 'smile', position: defaultPosition },
    });
    const comp = wrapper.vm as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    comp.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await nextTick();
    expect(comp.highlightedIndex).toBe(1);

    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await nextTick();
    expect(comp.highlightedIndex).toBe(0);
  });
});
