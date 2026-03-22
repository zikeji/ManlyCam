import { describe, it, expect, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import EmojiPicker from './EmojiPicker.vue';
import { EMOJI_CATEGORIES, EMOJI_LIST } from '@/lib/emoji-data';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('EmojiPicker.vue', () => {
  it('does not render when visible=false', () => {
    wrapper = mount(EmojiPicker, { props: { visible: false } });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('renders when visible=true', () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  });

  it('has aria-label "Emoji picker"', () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('Emoji picker');
  });

  it('renders search input', () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    expect(wrapper.find('input[aria-label="Search emojis"]').exists()).toBe(true);
  });

  it('renders category tabs when not searching', () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    for (const cat of EMOJI_CATEGORIES) {
      expect(wrapper.text()).toContain(cat);
    }
  });

  it('hides category tabs when searching', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    await wrapper.find('input').setValue('smile');
    await nextTick();
    // Category tabs div should be hidden (v-if="!searchQuery")
    for (const cat of EMOJI_CATEGORIES) {
      if (cat !== 'smileys') {
        // Only check that non-matching category buttons aren't shown in tab area
        const categoryButtons = wrapper
          .findAll('button[aria-label]')
          .filter((b) => EMOJI_CATEGORIES.includes(b.attributes('aria-label') as never));
        expect(categoryButtons.length).toBe(0);
      }
      break;
    }
  });

  it('filters emojis by search query', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    await wrapper.find('input').setValue('smile');
    await nextTick();

    const emojiButtons = wrapper.findAll('[role="option"]');
    expect(emojiButtons.length).toBeGreaterThan(0);

    // Results match "smile" by name substring or keyword — verify results exist
    const names = emojiButtons.map((b) => b.attributes('aria-label') ?? '');
    expect(names.length).toBeGreaterThan(0);

    // All results match either by name or keyword (search correctness)
    const { EMOJI_LIST: emojiList } = await import('@/lib/emoji-data');
    for (const label of names) {
      const emoji = emojiList.find((e) => e.name === label);
      if (emoji) {
        const matches =
          emoji.name.includes('smile') || emoji.keywords.some((k) => k.includes('smile'));
        expect(matches).toBe(true);
      }
    }
  });

  it('shows "No emojis found" for non-matching search', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    await wrapper.find('input').setValue('xyznotamoji999');
    await nextTick();
    expect(wrapper.text()).toContain('No emojis found');
  });

  it('switches category when tab is clicked', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    // Default category is 'smileys'
    const animalsCat = EMOJI_CATEGORIES.find((c) => c === 'animals')!;
    const catButton = wrapper.findAll('button').find((b) => b.text().trim() === animalsCat);
    expect(catButton).toBeDefined();
    await catButton!.trigger('click');
    await nextTick();

    const emojiButtons = wrapper.findAll('[role="option"]');
    // All shown emojis should be from the animals category
    for (const btn of emojiButtons) {
      const label = btn.attributes('aria-label') ?? '';
      const emoji = EMOJI_LIST.find((e) => e.name === label);
      if (emoji) {
        expect(emoji.category).toBe('animals');
      }
    }
  });

  it('emits select event when emoji is clicked', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    const firstEmoji = wrapper.find('[role="option"]');
    expect(firstEmoji.exists()).toBe(true);
    await firstEmoji.trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0].length).toBe(1);
  });

  it('emitted select contains emoji object with required fields', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    const firstEmoji = wrapper.find('[role="option"]');
    await firstEmoji.trigger('click');
    const emittedEmoji = wrapper.emitted('select')![0][0] as { name: string; codepoint: string };
    expect(emittedEmoji.name).toBeTruthy();
    expect(emittedEmoji.codepoint).toBeTruthy();
  });

  it('emits close event on Escape key', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('handles Enter key on highlighted emoji', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('select')).toBeTruthy();
  });

  it('highlighted index changes on ArrowRight key', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    // First emoji should be highlighted (index 0)
    const options = wrapper.findAll('[role="option"]');
    expect(options[0].attributes('aria-selected')).toBe('true');

    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'ArrowRight' });
    await nextTick();
    const optionsAfter = wrapper.findAll('[role="option"]');
    expect(optionsAfter[1].attributes('aria-selected')).toBe('true');
  });

  it('highlighted index decrements on ArrowLeft key', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'ArrowRight' });
    await nextTick();
    const afterRight = wrapper.findAll('[role="option"]');
    expect(afterRight[1].attributes('aria-selected')).toBe('true');

    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'ArrowLeft' });
    await nextTick();
    const afterLeft = wrapper.findAll('[role="option"]');
    expect(afterLeft[0].attributes('aria-selected')).toBe('true');
  });

  it('highlighted index moves down a row on ArrowDown key', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    const options = wrapper.findAll('[role="option"]');
    expect(options[8]?.attributes('aria-selected')).toBe('true');
  });

  it('highlighted index moves up a row on ArrowUp key', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'ArrowUp' });
    await nextTick();
    const options = wrapper.findAll('[role="option"]');
    expect(options[0].attributes('aria-selected')).toBe('true');
  });

  it('resets search and category when picker reopens', async () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    await wrapper.find('input').setValue('smile');
    await nextTick();

    // Simulate picker closing and reopening
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await nextTick();

    const input = wrapper.find('input').element as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('renders emoji images with loading=lazy', () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    const imgs = wrapper.findAll('[role="option"] img');
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.attributes('loading')).toBe('lazy');
    }
  });

  it('emoji images have src pointing to self-hosted /emojis/ path', () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    const firstImg = wrapper.find('[role="option"] img');
    expect(firstImg.exists()).toBe(true);
    expect(firstImg.attributes('src')).toContain('/emojis/');
  });

  it('shows smileys category emojis by default', () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    const options = wrapper.findAll('[role="option"]');
    expect(options.length).toBeGreaterThan(0);
    // Spot check: grinning_face is a smileys emoji
    const grinning = options.find((o) => o.attributes('aria-label') === 'grinning_face');
    expect(grinning).toBeDefined();
  });

  it('selected category button has aria-pressed=true', () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    const smileysCatBtn = wrapper
      .findAll('button[aria-pressed]')
      .find((b) => b.attributes('aria-label') === 'smileys');
    expect(smileysCatBtn).toBeDefined();
    expect(smileysCatBtn!.attributes('aria-pressed')).toBe('true');
  });

  it('root div has data-emoji-picker attribute', () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    expect(wrapper.find('[data-emoji-picker]').exists()).toBe(true);
  });

  it('uses absolute positioning classes when no position prop is given', () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.classes()).toContain('absolute');
    expect(dialog.classes()).toContain('bottom-full');
    expect(dialog.classes()).toContain('right-0');
    expect(dialog.classes()).toContain('z-50');
    expect(dialog.classes()).toContain('mb-1');
  });

  it('uses fixed positioning when position prop is provided', () => {
    wrapper = mount(EmojiPicker, {
      props: { visible: true, position: { bottom: 100, right: 20 } },
    });
    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.classes()).toContain('fixed');
    expect(dialog.classes()).toContain('z-[200]');
    expect(dialog.classes()).not.toContain('absolute');
  });

  it('applies inline style from position prop', () => {
    wrapper = mount(EmojiPicker, {
      props: { visible: true, position: { bottom: 100, right: 20 } },
    });
    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.attributes('style')).toContain('bottom: 100px');
    expect(dialog.attributes('style')).toContain('right: 20px');
  });

  it('does not apply inline style when no position prop', () => {
    wrapper = mount(EmojiPicker, { props: { visible: true } });
    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.attributes('style')).toBeUndefined();
  });
});
