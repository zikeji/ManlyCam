import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import ReactionBar from './ReactionBar.vue';
import { EMOJI_MAP } from '@/lib/emoji-data';

// Mock EmojiPicker to avoid complex dependencies
vi.mock('./EmojiPicker.vue', () => ({
  default: {
    name: 'EmojiPicker',
    props: ['visible', 'position'],
    emits: ['select', 'close'],
    template:
      '<div v-if="visible" data-testid="emoji-picker" :data-visible="visible" @click="$emit(\'close\')"></div>',
  },
}));

// Mock emoji-data to avoid Vite glob import issues
vi.mock('@/lib/emoji-data', () => ({
  EMOJI_MAP: new Map([
    ['thumbs_up', { name: 'thumbs_up', codepoint: '1f44d', keywords: [], category: 'people' }],
    ['thumbs_down', { name: 'thumbs_down', codepoint: '1f44e', keywords: [], category: 'people' }],
    [
      'face_with_tears_of_joy',
      { name: 'face_with_tears_of_joy', codepoint: '1f602', keywords: [], category: 'smileys' },
    ],
    ['red_heart', { name: 'red_heart', codepoint: '2764-fe0f', keywords: [], category: 'smileys' }],
    [
      'face_with_open_mouth',
      { name: 'face_with_open_mouth', codepoint: '1f62e', keywords: [], category: 'smileys' },
    ],
    ['crying_face', { name: 'crying_face', codepoint: '1f622', keywords: [], category: 'smileys' }],
  ]),
  getEmojiUrl: (codepoint: string) => `/emojis/${codepoint}.svg`,
  EMOJI_LIST: [],
  EMOJI_CATEGORIES: ['smileys'],
  searchEmojis: vi.fn(() => []),
}));

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('ReactionBar.vue', () => {
  it('renders quick reaction buttons', () => {
    wrapper = mount(ReactionBar);
    const buttons = wrapper.findAll('button[aria-label]');
    // 6 quick reactions + 1 "More" button
    expect(buttons.length).toBeGreaterThanOrEqual(6);
  });

  it('renders the "More emoji reactions" button', () => {
    wrapper = mount(ReactionBar);
    expect(wrapper.find('button[aria-label="More emoji reactions"]').exists()).toBe(true);
  });

  it('emits select event when a quick reaction is clicked', async () => {
    wrapper = mount(ReactionBar);
    const thumbsUpBtn = wrapper.find('button[aria-label="thumbs up"]');
    expect(thumbsUpBtn.exists()).toBe(true);
    await thumbsUpBtn.trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['thumbs_up']);
  });

  it('emits select with face_with_tears_of_joy', async () => {
    wrapper = mount(ReactionBar);
    const btn = wrapper.find('button[aria-label="face with tears of joy"]');
    expect(btn.exists()).toBe(true);
    await btn.trigger('click');
    expect(wrapper.emitted('select')![0]).toEqual(['face_with_tears_of_joy']);
  });

  it('toggles emoji picker on "More" button click', async () => {
    wrapper = mount(ReactionBar);
    const moreBtn = wrapper.find('button[aria-label="More emoji reactions"]');
    expect(wrapper.find('[data-testid="emoji-picker"]').exists()).toBe(false);
    await moreBtn.trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="emoji-picker"]').exists()).toBe(true);
  });

  it('toggles picker off when "More" button is clicked again', async () => {
    wrapper = mount(ReactionBar);
    const moreBtn = wrapper.find('button[aria-label="More emoji reactions"]');

    await moreBtn.trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="emoji-picker"]').exists()).toBe(true);

    await moreBtn.trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="emoji-picker"]').exists()).toBe(false);
  });

  it('closes picker when EmojiPicker emits close', async () => {
    wrapper = mount(ReactionBar);
    const moreBtn = wrapper.find('button[aria-label="More emoji reactions"]');
    await moreBtn.trigger('click');
    await nextTick();

    const picker = wrapper.findComponent({ name: 'EmojiPicker' });
    await picker.vm.$emit('close');
    await nextTick();

    expect(wrapper.find('[data-testid="emoji-picker"]').exists()).toBe(false);
  });

  it('disables all buttons when disabled=true', () => {
    wrapper = mount(ReactionBar, { props: { disabled: true } });
    const buttons = wrapper.findAll('button');
    buttons.forEach((btn) => {
      expect(btn.element.disabled).toBe(true);
    });
  });

  it('has role="toolbar" for accessibility', () => {
    wrapper = mount(ReactionBar);
    expect(wrapper.find('[role="toolbar"]').exists()).toBe(true);
  });

  it('renders 6 quick reaction buttons', () => {
    wrapper = mount(ReactionBar);
    const quickBtns = wrapper
      .findAll('button')
      .filter((b) => b.attributes('aria-label') !== 'More emoji reactions');
    expect(quickBtns).toHaveLength(6);
  });

  it('emits select and closes picker when EmojiPicker emits select', async () => {
    wrapper = mount(ReactionBar);
    const moreBtn = wrapper.find('button[aria-label="More emoji reactions"]');
    await moreBtn.trigger('click');
    await nextTick();
    const picker = wrapper.findComponent({ name: 'EmojiPicker' });
    await picker.vm.$emit('select', {
      name: 'red_heart',
      codepoint: '2764-fe0f',
      keywords: [],
      category: 'smileys',
    });
    await nextTick();
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['red_heart']);
    expect(wrapper.find('[data-testid="emoji-picker"]').exists()).toBe(false);
  });

  it('emits pickerChange(true) when "More" button is clicked', async () => {
    wrapper = mount(ReactionBar);
    const moreBtn = wrapper.find('button[aria-label="More emoji reactions"]');
    await moreBtn.trigger('click');
    await nextTick();
    const events = wrapper.emitted('pickerChange');
    expect(events).toBeTruthy();
    expect(events![0]).toEqual([true]);
  });

  it('emits pickerChange(false) when picker is toggled off', async () => {
    wrapper = mount(ReactionBar);
    const moreBtn = wrapper.find('button[aria-label="More emoji reactions"]');
    await moreBtn.trigger('click');
    await nextTick();
    await moreBtn.trigger('click');
    await nextTick();
    const events = wrapper.emitted('pickerChange');
    expect(events).toBeTruthy();
    expect(events![0]).toEqual([true]);
    expect(events![1]).toEqual([false]);
  });

  it('emits pickerChange(false) when EmojiPicker emits close', async () => {
    wrapper = mount(ReactionBar);
    const moreBtn = wrapper.find('button[aria-label="More emoji reactions"]');
    await moreBtn.trigger('click');
    await nextTick();
    const picker = wrapper.findComponent({ name: 'EmojiPicker' });
    await picker.vm.$emit('close');
    await nextTick();
    const events = wrapper.emitted('pickerChange');
    expect(events![events!.length - 1]).toEqual([false]);
  });

  it('shows fallback span when emoji is not in EMOJI_MAP', async () => {
    EMOJI_MAP.delete('thumbs_up');
    wrapper = mount(ReactionBar);
    expect(wrapper.find('span.text-xs').exists()).toBe(true);
    EMOJI_MAP.set('thumbs_up', {
      name: 'thumbs_up',
      codepoint: '1f44d',
      keywords: [],
      category: 'people',
    });
  });
});
