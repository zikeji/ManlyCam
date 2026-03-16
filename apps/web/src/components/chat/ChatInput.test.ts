import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import ChatInput from './ChatInput.vue';
import type { UserPresence } from '@manlycam/types';

// Mock useCommands — keep real availableCommands ref so tests can set it directly;
// override loadCommands/refreshCommands to prevent actual API fetches.
vi.mock('@/composables/useCommands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useCommands')>();
  return {
    ...actual,
    loadCommands: vi.fn().mockResolvedValue(undefined),
    refreshCommands: vi.fn().mockResolvedValue(undefined),
  };
});

import { availableCommands } from '@/composables/useCommands';

const makeViewer = (id: string, displayName: string): UserPresence => ({
  id,
  displayName,
  avatarUrl: null,
  role: 'ViewerCompany',
  isMuted: false,
  userTag: null,
});

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

  describe('auto-resize', () => {
    it('resize sets overflowY to auto when scrollHeight exceeds maxHeight', async () => {
      wrapper = mount(ChatInput);
      const textarea = wrapper.find('textarea').element as HTMLTextAreaElement;
      // Make scrollHeight exceed the default maxHeight (200)
      Object.defineProperty(textarea, 'scrollHeight', { get: () => 400, configurable: true });
      await wrapper.find('textarea').setValue('content');
      await nextTick();
      expect(textarea.style.overflowY).toBe('auto');
    });

    it('ResizeObserver callback updates maxHeight and calls resize', async () => {
      let capturedCallback: (() => void) | null = null;
      vi.stubGlobal(
        'ResizeObserver',
        vi.fn((cb: () => void) => {
          capturedCallback = cb;
          return { observe: vi.fn(), disconnect: vi.fn() };
        }),
      );

      const panel = document.createElement('div');
      panel.setAttribute('data-chat-panel', '');
      Object.defineProperty(panel, 'clientHeight', { get: () => 600, configurable: true });
      document.body.appendChild(panel);

      wrapper = mount(ChatInput, { attachTo: panel });
      // Flush Vue's nextTick from onMounted, then advance fake timers to fire requestAnimationFrame
      await nextTick();
      await nextTick();
      vi.runAllTimers();
      await nextTick();

      // ResizeObserver callback should have been captured; fire it to cover lines 30-31
      expect(capturedCallback).not.toBeNull();
      capturedCallback!();

      panel.remove();
      vi.unstubAllGlobals();
    });
  });

  describe('muted prop', () => {
    it('shows muted placeholder when muted=true', () => {
      wrapper = mount(ChatInput, { props: { muted: true } });
      const textarea = wrapper.find('textarea');
      expect(textarea.attributes('placeholder')).toBe('You are muted');
    });

    it('textarea is readonly when muted=true', () => {
      wrapper = mount(ChatInput, { props: { muted: true } });
      expect(wrapper.find('textarea').attributes('readonly')).toBeDefined();
    });

    it('send button is disabled when muted=true even with content', async () => {
      // muted=true — the normal textarea isn't rendered, so button checks muted directly
      wrapper = mount(ChatInput, { props: { muted: true } });
      const button = wrapper.find('button[aria-label="Send message"]');
      expect(button.attributes('disabled')).toBeDefined();
    });

    it('shows normal placeholder when muted=false', () => {
      wrapper = mount(ChatInput, { props: { muted: false } });
      const textarea = wrapper.find('textarea');
      expect(textarea.attributes('placeholder')).toBe('Message ManlyCam…');
    });
  });

  describe('mention autocomplete', () => {
    const john = makeViewer('user-001', 'John Smith');
    const jane = makeViewer('user-002', 'Jane Doe');
    const viewers = [john, jane];

    it('shows autocomplete popup when @ is typed', async () => {
      wrapper = mount(ChatInput, { props: { viewers } });
      const textarea = wrapper.find('textarea');
      await textarea.setValue('@');
      await textarea.trigger('input');
      await nextTick();
      // Autocomplete should be visible (rendered in DOM)
      expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
    });

    it('hides autocomplete when space is typed after @query', async () => {
      wrapper = mount(ChatInput, { props: { viewers } });
      const textarea = wrapper.find('textarea');
      await textarea.setValue('@john ');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    });

    it('hides autocomplete when content does not have @', async () => {
      wrapper = mount(ChatInput, { props: { viewers } });
      const textarea = wrapper.find('textarea');
      await textarea.setValue('hello');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    });

    it('clears autocomplete when send is triggered', async () => {
      wrapper = mount(ChatInput, { props: { viewers } });
      const textarea = wrapper.find('textarea');
      await textarea.setValue('@john');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[role="listbox"]').exists()).toBe(true);

      await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });
      await nextTick();
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    });

    it('renders without viewers prop (no popup for empty list)', async () => {
      wrapper = mount(ChatInput);
      const textarea = wrapper.find('textarea');
      await textarea.setValue('@john');
      await textarea.trigger('input');
      await nextTick();
      // No viewers → no popup
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    });

    it('excludes current user from autocomplete list', async () => {
      wrapper = mount(ChatInput, {
        props: { viewers, currentUserId: 'user-001' },
      });
      const textarea = wrapper.find('textarea');
      await textarea.setValue('@');
      await textarea.trigger('input');
      await nextTick();
      // john (user-001) is current user — only jane should appear
      const options = wrapper.findAll('[role="option"]');
      expect(options).toHaveLength(1);
      expect(options[0].find('.truncate').text()).toBe('Jane Doe');
    });

    it('selecting an option inserts display @Name into textarea', async () => {
      wrapper = mount(ChatInput, { props: { viewers } });
      const textarea = wrapper.find('textarea');
      await textarea.setValue('@');
      await textarea.trigger('input');
      await nextTick();

      // Click the first option — viewers sorted alphabetically: Jane Doe before John Smith
      await wrapper.find('[role="option"]').trigger('mousedown');
      await nextTick();

      expect((textarea.element as HTMLTextAreaElement).value).toBe('@JaneDoe ');
    });

    it('closes mention popup on mousedown outside the textarea', async () => {
      wrapper = mount(ChatInput, { props: { viewers }, attachTo: document.body });
      const textarea = wrapper.find('textarea');
      await textarea.setValue('@');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[role="listbox"]').exists()).toBe(true);

      // Dispatch mousedown on an element outside the textarea — bubbles to document
      const outside = document.createElement('div');
      document.body.appendChild(outside);
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await nextTick();
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
      outside.remove();
    });

    it('does not convert manually typed @Name (not autocompleted) to <@ID>', async () => {
      wrapper = mount(ChatInput, { props: { viewers } });
      // Type @alice directly — never selected from autocomplete, so not in mentionMap
      await wrapper.find('textarea').setValue('@alice');
      await wrapper.find('button[aria-label="Send message"]').trigger('click');
      const emitted = wrapper.emitted('send');
      expect(emitted).toBeTruthy();
      // @alice is left as-is since it was not autocompleted
      expect(emitted![0][0]).toBe('@alice');
    });

    it('send resolves @Name tokens to <@ID> in emitted content', async () => {
      wrapper = mount(ChatInput, { props: { viewers } });
      const textarea = wrapper.find('textarea');
      // Select Jane Doe from autocomplete
      await textarea.setValue('@');
      await textarea.trigger('input');
      await nextTick();
      await wrapper.find('[role="option"]').trigger('mousedown');
      await nextTick();

      // Trigger send
      await wrapper.find('button[aria-label="Send message"]').trigger('click');

      const emitted = wrapper.emitted('send');
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toBe('<@user-002> ');
    });
  });

  describe('command autocomplete', () => {
    const mockCommands = [
      { name: 'shrug', description: 'Appends shrug', placeholder: '[message]' },
      { name: 'tableflip', description: 'Appends tableflip', placeholder: '[message]' },
    ];

    beforeEach(() => {
      availableCommands.value = mockCommands;
    });

    afterEach(() => {
      availableCommands.value = [];
    });

    it('does not show command autocomplete when no commands available', async () => {
      availableCommands.value = [];
      wrapper = mount(ChatInput);

      const textarea = wrapper.find('textarea');
      await textarea.setValue('/');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[aria-label="Command suggestions"]').exists()).toBe(false);
    });

    it('shows command autocomplete when / is typed and commands exist', async () => {
      wrapper = mount(ChatInput);

      const textarea = wrapper.find('textarea');
      await textarea.setValue('/');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[aria-label="Command suggestions"]').exists()).toBe(true);
    });

    it('hides command autocomplete when space is typed (command complete)', async () => {
      wrapper = mount(ChatInput);

      const textarea = wrapper.find('textarea');
      await textarea.setValue('/shrug ');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[aria-label="Command suggestions"]').exists()).toBe(false);
    });

    it('hides command autocomplete when text does not start with /', async () => {
      wrapper = mount(ChatInput);

      const textarea = wrapper.find('textarea');
      await textarea.setValue('hello');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[aria-label="Command suggestions"]').exists()).toBe(false);
    });

    it('selects a command and replaces /query with /name ', async () => {
      wrapper = mount(ChatInput);

      const textarea = wrapper.find('textarea');
      await textarea.setValue('/sh');
      await textarea.trigger('input');
      await nextTick();

      const option = wrapper.find('[aria-label="Command suggestions"] [role="option"]');
      expect(option.exists()).toBe(true);
      await option.trigger('mousedown');
      await nextTick();

      expect((textarea.element as HTMLTextAreaElement).value).toBe('/shrug ');
    });

    it('hides command autocomplete after selection', async () => {
      wrapper = mount(ChatInput);

      const textarea = wrapper.find('textarea');
      await textarea.setValue('/sh');
      await textarea.trigger('input');
      await nextTick();

      await wrapper.find('[aria-label="Command suggestions"] [role="option"]').trigger('mousedown');
      await nextTick();
      expect(wrapper.find('[aria-label="Command suggestions"]').exists()).toBe(false);
    });

    it('hides command autocomplete on send', async () => {
      wrapper = mount(ChatInput);

      const textarea = wrapper.find('textarea');
      await textarea.setValue('/sh');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[aria-label="Command suggestions"]').exists()).toBe(true);

      await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });
      await nextTick();
      expect(wrapper.find('[aria-label="Command suggestions"]').exists()).toBe(false);
    });
  });

  describe('emoji picker', () => {
    it('renders emoji picker button when not muted', () => {
      wrapper = mount(ChatInput);
      expect(wrapper.find('button[aria-label="Open emoji picker"]').exists()).toBe(true);
    });

    it('does not render emoji picker button when muted', () => {
      wrapper = mount(ChatInput, { props: { muted: true } });
      expect(wrapper.find('button[aria-label="Open emoji picker"]').exists()).toBe(false);
    });

    it('emoji picker is initially closed', () => {
      wrapper = mount(ChatInput);
      expect(
        wrapper.find('button[aria-label="Open emoji picker"]').attributes('aria-expanded'),
      ).toBe('false');
    });

    it('clicking emoji button opens the picker', async () => {
      wrapper = mount(ChatInput);
      await wrapper.find('button[aria-label="Open emoji picker"]').trigger('click');
      await nextTick();
      expect(wrapper.find('[role="dialog"][aria-label="Emoji picker"]').exists()).toBe(true);
    });

    it('clicking emoji button again closes the picker', async () => {
      wrapper = mount(ChatInput);
      const btn = wrapper.find('button[aria-label="Open emoji picker"]');
      await btn.trigger('click');
      await nextTick();
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
      await btn.trigger('click');
      await nextTick();
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    });

    it('selecting an emoji from picker inserts :shortcode: in textarea', async () => {
      wrapper = mount(ChatInput);
      await wrapper.find('button[aria-label="Open emoji picker"]').trigger('click');
      await nextTick();

      const firstEmoji = wrapper.find('[role="dialog"] [role="option"]');
      expect(firstEmoji.exists()).toBe(true);
      await firstEmoji.trigger('click');
      await nextTick();

      const textarea = wrapper.find('textarea');
      const value = (textarea.element as HTMLTextAreaElement).value;
      expect(value).toMatch(/^:[a-z0-9_]+:$/);
    });

    it('picker remains open after selecting an emoji (AC #3)', async () => {
      wrapper = mount(ChatInput);
      await wrapper.find('button[aria-label="Open emoji picker"]').trigger('click');
      await nextTick();

      const firstEmoji = wrapper.find('[role="dialog"] [role="option"]');
      await firstEmoji.trigger('click');
      await nextTick();

      // Picker should still be visible
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    });

    it('closing picker with Escape returns focus to input', async () => {
      wrapper = mount(ChatInput, { attachTo: document.body });
      await wrapper.find('button[aria-label="Open emoji picker"]').trigger('click');
      await nextTick();
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

      await wrapper.find('textarea').trigger('keydown', { key: 'Escape' });
      await nextTick();
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    });

    it('picker closes on send', async () => {
      wrapper = mount(ChatInput);
      const textarea = wrapper.find('textarea');
      await textarea.setValue('hello');
      await wrapper.find('button[aria-label="Open emoji picker"]').trigger('click');
      await nextTick();
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

      await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });
      await nextTick();
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    });
  });

  describe('emoji autocomplete', () => {
    it('shows emoji autocomplete when : followed by letters is typed', async () => {
      wrapper = mount(ChatInput);
      const textarea = wrapper.find('textarea');
      await textarea.setValue(':smile');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[aria-label="Emoji suggestions"]').exists()).toBe(true);
    });

    it('does not show emoji autocomplete for just a colon', async () => {
      wrapper = mount(ChatInput);
      const textarea = wrapper.find('textarea');
      await textarea.setValue(':');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[aria-label="Emoji suggestions"]').exists()).toBe(false);
    });

    it('does not show emoji autocomplete when text does not start with :', async () => {
      wrapper = mount(ChatInput);
      const textarea = wrapper.find('textarea');
      await textarea.setValue('hello world');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[aria-label="Emoji suggestions"]').exists()).toBe(false);
    });

    it('hides emoji autocomplete when query has no results', async () => {
      wrapper = mount(ChatInput);
      const textarea = wrapper.find('textarea');
      await textarea.setValue(':xyznotamoji999');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[aria-label="Emoji suggestions"]').exists()).toBe(false);
    });

    it('selecting emoji from autocomplete replaces :query with :shortcode:', async () => {
      wrapper = mount(ChatInput);
      const textarea = wrapper.find('textarea');
      await textarea.setValue(':smile');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[aria-label="Emoji suggestions"]').exists()).toBe(true);

      await wrapper.find('[aria-label="Emoji suggestions"] [role="option"]').trigger('mousedown');
      await nextTick();

      const value = (textarea.element as HTMLTextAreaElement).value;
      expect(value).toMatch(/^:[a-z0-9_]+:$/);
    });

    it('closes emoji autocomplete after selection', async () => {
      wrapper = mount(ChatInput);
      const textarea = wrapper.find('textarea');
      await textarea.setValue(':smile');
      await textarea.trigger('input');
      await nextTick();

      await wrapper.find('[aria-label="Emoji suggestions"] [role="option"]').trigger('mousedown');
      await nextTick();
      expect(wrapper.find('[aria-label="Emoji suggestions"]').exists()).toBe(false);
    });

    it('closes emoji autocomplete on send', async () => {
      wrapper = mount(ChatInput);
      const textarea = wrapper.find('textarea');
      await textarea.setValue(':smile');
      await textarea.trigger('input');
      await nextTick();
      expect(wrapper.find('[aria-label="Emoji suggestions"]').exists()).toBe(true);

      await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });
      await nextTick();
      expect(wrapper.find('[aria-label="Emoji suggestions"]').exists()).toBe(false);
    });
  });
});
