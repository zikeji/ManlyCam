import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChatInput from './ChatInput.vue';

describe('ChatInput.vue', () => {
  it('renders a textarea with correct placeholder', () => {
    const wrapper = mount(ChatInput);
    const textarea = wrapper.find('textarea');
    expect(textarea.exists()).toBe(true);
    expect(textarea.attributes('placeholder')).toBe('Message ManlyCam…');
  });

  it('has aria-label on textarea', () => {
    const wrapper = mount(ChatInput);
    expect(wrapper.find('textarea').attributes('aria-label')).toBe('Message ManlyCam');
  });

  it('send button is disabled when textarea is empty', () => {
    const wrapper = mount(ChatInput);
    const button = wrapper.find('button[aria-label="Send message"]');
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('send button is enabled when there is content', async () => {
    const wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('Hello');
    const button = wrapper.find('button[aria-label="Send message"]');
    expect(button.attributes('disabled')).toBeUndefined();
  });

  it('send button is disabled when content is whitespace only', async () => {
    const wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('   ');
    const button = wrapper.find('button[aria-label="Send message"]');
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('Enter key emits send with content and clears textarea', async () => {
    const wrapper = mount(ChatInput);
    const textarea = wrapper.find('textarea');
    await textarea.setValue('Hello world');
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });

    expect(wrapper.emitted('send')).toBeTruthy();
    expect(wrapper.emitted('send')![0]).toEqual(['Hello world']);
    expect((textarea.element as HTMLTextAreaElement).value).toBe('');
  });

  it('Shift+Enter inserts newline and does not emit send', async () => {
    const wrapper = mount(ChatInput);
    const textarea = wrapper.find('textarea');
    await textarea.setValue('Hello');
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true });

    expect(wrapper.emitted('send')).toBeFalsy();
  });

  it('Enter on empty textarea does not emit send', async () => {
    const wrapper = mount(ChatInput);
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: false });
    expect(wrapper.emitted('send')).toBeFalsy();
  });

  it('char counter is hidden below 800 characters', async () => {
    const wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('a'.repeat(799));
    expect(wrapper.text()).not.toContain('/1000');
  });

  it('char counter appears at 800 characters', async () => {
    const wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('a'.repeat(800));
    expect(wrapper.text()).toContain('800/1000');
  });

  it('char counter shows correct count at 950 characters', async () => {
    const wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('a'.repeat(950));
    expect(wrapper.text()).toContain('950/1000');
  });

  it('ArrowUp on empty input emits editLast', async () => {
    const wrapper = mount(ChatInput);
    await wrapper.find('textarea').trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('editLast')).toBeTruthy();
  });

  it('ArrowUp on non-empty input does not emit editLast', async () => {
    const wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('some text');
    await wrapper.find('textarea').trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('editLast')).toBeFalsy();
  });

  it('clicking send button emits send and clears input', async () => {
    const wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('Test message');
    await wrapper.find('button[aria-label="Send message"]').trigger('click');

    expect(wrapper.emitted('send')).toBeTruthy();
    expect(wrapper.emitted('send')![0]).toEqual(['Test message']);
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('');
  });
});
