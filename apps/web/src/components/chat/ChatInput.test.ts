import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import ChatInput from './ChatInput.vue';

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  wrapper?.unmount();
  wrapper = null;
});

describe('ChatInput.vue', () => {
  it('renders a textarea with correct placeholder', () => {
    wrapper = mount(ChatInput);
    const textarea = wrapper.find('textarea');
    expect(textarea.exists()).toBe(true);
    expect(textarea.attributes('placeholder')).toBe('Message ManlyCam…');
  });

  it('has aria-label on textarea', () => {
    wrapper = mount(ChatInput);
    expect(wrapper.find('textarea').attributes('aria-label')).toBe('Message ManlyCam');
  });

  it('send button is disabled when textarea is empty', () => {
    wrapper = mount(ChatInput);
    const button = wrapper.find('button[aria-label="Send message"]');
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('send button is enabled when there is content', async () => {
    wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('Hello');
    const button = wrapper.find('button[aria-label="Send message"]');
    expect(button.attributes('disabled')).toBeUndefined();
  });

  it('send button is disabled when content is whitespace only', async () => {
    wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('   ');
    const button = wrapper.find('button[aria-label="Send message"]');
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('Enter key emits send with content and clears textarea', async () => {
    wrapper = mount(ChatInput);
    const textarea = wrapper.find('textarea');
    await textarea.setValue('Hello world');
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });

    expect(wrapper.emitted('send')).toBeTruthy();
    expect(wrapper.emitted('send')![0]).toEqual(['Hello world']);
    expect((textarea.element as HTMLTextAreaElement).value).toBe('');
  });

  it('Shift+Enter inserts newline and does not emit send', async () => {
    wrapper = mount(ChatInput);
    const textarea = wrapper.find('textarea');
    await textarea.setValue('Hello');
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true });

    expect(wrapper.emitted('send')).toBeFalsy();
  });

  it('Enter on empty textarea does not emit send', async () => {
    wrapper = mount(ChatInput);
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: false });
    expect(wrapper.emitted('send')).toBeFalsy();
  });

  it('char counter is hidden below 800 characters', async () => {
    wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('a'.repeat(799));
    expect(wrapper.text()).not.toContain('/1000');
  });

  it('char counter appears at 800 characters', async () => {
    wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('a'.repeat(800));
    expect(wrapper.text()).toContain('800/1000');
  });

  it('char counter shows correct count at 950 characters', async () => {
    wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('a'.repeat(950));
    expect(wrapper.text()).toContain('950/1000');
  });

  it('ArrowUp on empty input emits editLast', async () => {
    wrapper = mount(ChatInput);
    await wrapper.find('textarea').trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('editLast')).toBeTruthy();
  });

  it('ArrowUp on non-empty input does not emit editLast', async () => {
    wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('some text');
    await wrapper.find('textarea').trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('editLast')).toBeFalsy();
  });

  it('clicking send button emits send and clears input', async () => {
    wrapper = mount(ChatInput);
    await wrapper.find('textarea').setValue('Test message');
    await wrapper.find('button[aria-label="Send message"]').trigger('click');

    expect(wrapper.emitted('send')).toBeTruthy();
    expect(wrapper.emitted('send')![0]).toEqual(['Test message']);
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('');
  });

  describe('typing events', () => {
    it('emits typingStart immediately on first keystroke with non-empty content', async () => {
      wrapper = mount(ChatInput);
      await wrapper.find('textarea').setValue('h');
      await wrapper.find('textarea').trigger('input');
      expect(wrapper.emitted('typingStart')).toBeTruthy();
    });

    it('does not emit typingStart if input is empty/whitespace', async () => {
      wrapper = mount(ChatInput);
      await wrapper.find('textarea').setValue('   ');
      await wrapper.find('textarea').trigger('input');
      expect(wrapper.emitted('typingStart')).toBeFalsy();
    });

    it('emits typingStart heartbeat every 4s while still typing', async () => {
      wrapper = mount(ChatInput);
      const textarea = wrapper.find('textarea');
      await textarea.setValue('h');
      await textarea.trigger('input'); // T=0: typingStart fires, heartbeat interval starts
      expect((wrapper.emitted('typingStart') ?? []).length).toBe(1);

      // Keep typing every 1s to prevent 2s stop timer from firing
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(1000);
        await textarea.trigger('input');
      }
      // T=4000ms: heartbeat fires
      expect((wrapper.emitted('typingStart') ?? []).length).toBe(2);

      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(1000);
        await textarea.trigger('input');
      }
      // T=8000ms: second heartbeat fires
      expect((wrapper.emitted('typingStart') ?? []).length).toBe(3);
    });

    it('emits typingStop 2000ms after last keystroke', async () => {
      wrapper = mount(ChatInput);
      await wrapper.find('textarea').setValue('h');
      await wrapper.find('textarea').trigger('input');
      vi.advanceTimersByTime(2000);
      expect(wrapper.emitted('typingStop')).toBeTruthy();
    });

    it('does not emit typingStop again if already stopped', async () => {
      wrapper = mount(ChatInput);
      await wrapper.find('textarea').setValue('h');
      await wrapper.find('textarea').trigger('input');
      vi.advanceTimersByTime(2000); // first stop
      const stopCount = (wrapper.emitted('typingStop') ?? []).length;
      vi.advanceTimersByTime(5000);
      expect((wrapper.emitted('typingStop') ?? []).length).toBe(stopCount);
    });

    it('keystroke resets the 2s stop timer', async () => {
      wrapper = mount(ChatInput);
      await wrapper.find('textarea').setValue('h');
      await wrapper.find('textarea').trigger('input');
      // typingStart fires immediately (T=0)

      // Advance to T=1800ms — stop timer NOT fired yet (fires at T=2000ms)
      vi.advanceTimersByTime(1800);
      expect(wrapper.emitted('typingStop')).toBeFalsy();

      // Second keystroke resets stop timer to T=1800 + 2000 = T=3800ms
      await wrapper.find('textarea').setValue('hi');
      await wrapper.find('textarea').trigger('input');

      // Advance to T=3799ms (1999ms since second keystroke — stop timer NOT fired)
      vi.advanceTimersByTime(1999);
      expect(wrapper.emitted('typingStop')).toBeFalsy();

      // Advance 1 more ms → T=3800ms (2000ms since second keystroke — stop fires)
      vi.advanceTimersByTime(1);
      expect(wrapper.emitted('typingStop')).toBeTruthy();
    });

    it('heartbeat stops after typingStop fires', async () => {
      wrapper = mount(ChatInput);
      await wrapper.find('textarea').setValue('h');
      await wrapper.find('textarea').trigger('input');
      vi.advanceTimersByTime(2000); // stop fires
      const startCount = (wrapper.emitted('typingStart') ?? []).length;
      vi.advanceTimersByTime(8000); // two more heartbeat intervals — should not fire
      expect((wrapper.emitted('typingStart') ?? []).length).toBe(startCount);
    });

    it('send immediately emits typingStop if typing was active', async () => {
      wrapper = mount(ChatInput);
      await wrapper.find('textarea').setValue('hello');
      await wrapper.find('textarea').trigger('input');
      expect(wrapper.emitted('typingStart')).toBeTruthy();

      // Send — should immediately emit typingStop before send
      await wrapper.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: false });

      const emitted = wrapper.emitted();
      const typingStopCalls = emitted['typingStop'] ?? [];
      const sendCalls = emitted['send'] ?? [];
      expect(typingStopCalls.length).toBeGreaterThan(0);
      expect(sendCalls.length).toBeGreaterThan(0);
    });
  });
});
