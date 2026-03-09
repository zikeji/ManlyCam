import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import ChatMessage from './ChatMessage.vue';
import type { ChatMessage as ChatMessageType } from '@manlycam/types';

// Mock lucide-vue-next MoreHorizontal icon with data-icon attribute
vi.mock('lucide-vue-next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-vue-next')>();
  return {
    ...actual,
    MoreHorizontal: defineComponent({
      template: '<svg data-icon="MoreHorizontal" />',
    }),
  };
});

// Mock dropdown-menu with simple stubs that fire click events
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: defineComponent({ template: '<div><slot/></div>' }),
  DropdownMenuTrigger: defineComponent({ template: '<div><slot/></div>' }),
  DropdownMenuContent: defineComponent({ template: '<div><slot/></div>' }),
  DropdownMenuItem: defineComponent({
    emits: ['click'],
    template: '<div @click="$emit(\'click\', $event)"><slot/></div>',
  }),
}));

// Mock tooltip with simple stubs that render slot content
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: defineComponent({ template: '<div><slot/></div>' }),
  Tooltip: defineComponent({ template: '<div><slot/></div>' }),
  TooltipTrigger: defineComponent({ template: '<div><slot/></div>' }),
  TooltipContent: defineComponent({ template: '<div><slot/></div>' }),
}));

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
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
  });

  it('renders with role="listitem"', () => {
    wrapper = mount(ChatMessage, { props: { message: baseMessage } });
    expect(wrapper.find('[role="listitem"]').exists()).toBe(true);
  });

  it('renders display name', () => {
    wrapper = mount(ChatMessage, { props: { message: baseMessage } });
    expect(wrapper.text()).toContain('Test User');
  });

  it('renders message content', () => {
    wrapper = mount(ChatMessage, { props: { message: baseMessage } });
    expect(wrapper.text()).toContain('Hello world');
  });

  it('renders avatar fallback initials (first letter of each word)', () => {
    wrapper = mount(ChatMessage, { props: { message: baseMessage } });
    // "Test User" → T + U = "TU"
    expect(wrapper.text()).toContain('TU');
  });

  it('renders avatar image when avatarUrl is set', () => {
    wrapper = mount(ChatMessage, {
      props: { message: { ...baseMessage, avatarUrl: 'https://example.com/avatar.jpg' } },
    });
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/avatar.jpg');
  });

  it('renders bold markdown', () => {
    wrapper = mount(ChatMessage, {
      props: { message: { ...baseMessage, content: '**bold text**' } },
    });
    expect(wrapper.find('strong').exists()).toBe(true);
    expect(wrapper.find('strong').text()).toBe('bold text');
  });

  it('renders inline code markdown', () => {
    wrapper = mount(ChatMessage, {
      props: { message: { ...baseMessage, content: '`code here`' } },
    });
    expect(wrapper.find('code').exists()).toBe(true);
    expect(wrapper.find('code').text()).toBe('code here');
  });

  it('renders link markdown with target=_blank', () => {
    wrapper = mount(ChatMessage, {
      props: { message: { ...baseMessage, content: '[click here](https://example.com)' } },
    });
    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('https://example.com');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
  });

  it('suppresses javascript: URLs in links', () => {
    wrapper = mount(ChatMessage, {
      props: { message: { ...baseMessage, content: '[bad](javascript:alert(1))' } },
    });
    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('#');
    expect(link.attributes('href')).not.toContain('javascript:');
  });

  it('renders userTag when present', () => {
    wrapper = mount(ChatMessage, {
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
    wrapper = mount(ChatMessage, { props: { message: baseMessage } });
    expect(wrapper.text()).not.toContain('Guest');
    expect(wrapper.text()).not.toContain('VIP');
  });

  describe('context menu (group row)', () => {
    it('context menu button NOT rendered when isOwn=false', () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: false } });
      expect(wrapper.find('[aria-label="Message actions"]').exists()).toBe(false);
    });

    it('context menu button IS rendered when isOwn=true', () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });
      expect(wrapper.find('[aria-label="Message actions"]').exists()).toBe(true);
    });
  });

  describe('edit mode (group row)', () => {
    beforeEach(() => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });
    });

    function findDropdownItem(w: VueWrapper, text: string) {
      return w.findAll('div').find((el) => el.element.textContent?.trim() === text);
    }

    it('clicking Edit opens textarea pre-filled with message content', async () => {
      const editItem = findDropdownItem(wrapper!, 'Edit');
      await editItem!.trigger('click');
      await nextTick();

      const textarea = wrapper!.find('textarea');
      expect(textarea.exists()).toBe(true);
      expect((textarea.element as HTMLTextAreaElement).value).toBe('Hello world');
    });

    it('Escape key cancels edit and restores message body', async () => {
      const editItem = findDropdownItem(wrapper!, 'Edit');
      await editItem!.trigger('click');
      await nextTick();

      await wrapper!.find('textarea').trigger('keydown', { key: 'Escape' });
      await nextTick();

      expect(wrapper!.find('textarea').exists()).toBe(false);
      expect(wrapper!.text()).toContain('Hello world');
    });

    it('Enter key submits edit and emits requestEdit with message ID and trimmed content', async () => {
      const editItem = findDropdownItem(wrapper!, 'Edit');
      await editItem!.trigger('click');
      await nextTick();

      const textarea = wrapper!.find('textarea');
      await textarea.setValue('  Updated content  ');
      await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });
      await nextTick();

      const emitted = wrapper!.emitted('requestEdit');
      expect(emitted).toBeTruthy();
      expect(emitted![0]).toEqual(['msg-001', 'Updated content']);
    });

    it('clicking Save emits requestEdit with message ID and trimmed content', async () => {
      const editItem = findDropdownItem(wrapper!, 'Edit');
      await editItem!.trigger('click');
      await nextTick();

      await wrapper!.find('textarea').setValue('New content');
      const saveBtn = wrapper!.findAll('button').find((b) => b.text().trim() === 'Save');
      await saveBtn!.trigger('click');
      await nextTick();

      const emitted = wrapper!.emitted('requestEdit');
      expect(emitted).toBeTruthy();
      expect(emitted![0]).toEqual(['msg-001', 'New content']);
    });

    it('clicking Cancel restores message body without emitting', async () => {
      const editItem = findDropdownItem(wrapper!, 'Edit');
      await editItem!.trigger('click');
      await nextTick();

      const cancelBtn = wrapper!.findAll('button').find((b) => b.text().trim() === 'Cancel');
      await cancelBtn!.trigger('click');
      await nextTick();

      expect(wrapper!.find('textarea').exists()).toBe(false);
      expect(wrapper!.emitted('requestEdit')).toBeFalsy();
    });

    it('does not submit when editContent is empty/whitespace', async () => {
      const editItem = findDropdownItem(wrapper!, 'Edit');
      await editItem!.trigger('click');
      await nextTick();

      await wrapper!.find('textarea').setValue('   ');
      const saveBtn = wrapper!.findAll('button').find((b) => b.text().trim() === 'Save');
      await saveBtn!.trigger('click');
      await nextTick();

      expect(wrapper!.emitted('requestEdit')).toBeFalsy();
    });

    it('Save button is disabled when textarea is empty', async () => {
      const editItem = findDropdownItem(wrapper!, 'Edit');
      await editItem!.trigger('click');
      await nextTick();

      await wrapper!.find('textarea').setValue('');
      await nextTick();

      const saveBtn = wrapper!.findAll('button').find((b) => b.text().trim() === 'Save');
      expect((saveBtn!.element as HTMLButtonElement).disabled).toBe(true);
    });

    it('Save button is enabled when textarea has content', async () => {
      const editItem = findDropdownItem(wrapper!, 'Edit');
      await editItem!.trigger('click');
      await nextTick();

      const saveBtn = wrapper!.findAll('button').find((b) => b.text().trim() === 'Save');
      expect((saveBtn!.element as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('delete (group row)', () => {
    function findDeleteItem(w: VueWrapper) {
      return w.findAll('div').find((el) => el.element.textContent?.trim() === 'Delete');
    }

    it('clicking Delete calls window.confirm', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });

      const deleteItem = findDeleteItem(wrapper);
      await deleteItem!.trigger('click');

      expect(confirmSpy).toHaveBeenCalled();
    });

    it('when confirm returns true, emits requestDelete with message ID', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });

      const deleteItem = findDeleteItem(wrapper);
      await deleteItem!.trigger('click');

      const emitted = wrapper.emitted('requestDelete');
      expect(emitted).toBeTruthy();
      expect(emitted![0]).toEqual(['msg-001']);
    });

    it('when confirm returns false, does NOT emit requestDelete', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });

      const deleteItem = findDeleteItem(wrapper);
      await deleteItem!.trigger('click');

      expect(wrapper.emitted('requestDelete')).toBeFalsy();
    });

    it('shift+click skips confirm and emits requestDelete directly', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });

      const deleteItem = findDeleteItem(wrapper);
      const el = deleteItem!.element as HTMLElement;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      await nextTick();

      expect(confirmSpy).not.toHaveBeenCalled();
      const emitted = wrapper.emitted('requestDelete');
      expect(emitted).toBeTruthy();
      expect(emitted![0]).toEqual(['msg-001']);
    });
  });

  describe('edited indicator (group row)', () => {
    it('(edited) NOT shown when message.updatedAt is null', () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage } });
      expect(wrapper.text()).not.toContain('(edited)');
    });

    it('(edited) IS shown when message.updatedAt is non-null', () => {
      wrapper = mount(ChatMessage, {
        props: {
          message: { ...baseMessage, updatedAt: '2026-03-08T11:00:00.000Z' },
        },
      });
      expect(wrapper.text()).toContain('(edited)');
    });
  });

  describe('isContinuation=true (continuation row)', () => {
    it('does not render Avatar when isContinuation is true', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: true },
      });
      const avatarEl = wrapper.find('.h-8.w-8');
      expect(avatarEl.exists()).toBe(false);
    });

    it('does not render display name when isContinuation is true', () => {
      wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, displayName: 'UniqueNameXYZ' }, isContinuation: true },
      });
      expect(wrapper.text()).not.toContain('UniqueNameXYZ');
    });

    it('does not render userTag pill when isContinuation is true', () => {
      wrapper = mount(ChatMessage, {
        props: {
          message: { ...baseMessage, userTag: { text: 'VIP', color: '#FF0000' } },
          isContinuation: true,
        },
      });
      expect(wrapper.text()).not.toContain('VIP');
    });

    it('renders message body when isContinuation is true', () => {
      wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, content: 'Continuation text' }, isContinuation: true },
      });
      expect(wrapper.text()).toContain('Continuation text');
    });

    it('root element has pl-[52px] class when isContinuation is true', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: true },
      });
      const root = wrapper.find('[role="listitem"]');
      expect(root.classes().join(' ')).toContain('pl-[52px]');
    });

    it('context menu button NOT rendered when isOwn=false (continuation)', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: true, isOwn: false },
      });
      expect(wrapper.find('[aria-label="Message actions"]').exists()).toBe(false);
    });

    it('context menu button IS rendered when isOwn=true (continuation)', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: true, isOwn: true },
      });
      expect(wrapper.find('[aria-label="Message actions"]').exists()).toBe(true);
    });

    it('(edited) NOT shown when message.updatedAt is null (continuation)', () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isContinuation: true } });
      expect(wrapper.text()).not.toContain('(edited)');
    });

    it('(edited) IS shown when message.updatedAt is non-null (continuation)', () => {
      wrapper = mount(ChatMessage, {
        props: {
          message: { ...baseMessage, updatedAt: '2026-03-08T11:00:00.000Z' },
          isContinuation: true,
        },
      });
      expect(wrapper.text()).toContain('(edited)');
    });
  });

  describe('isContinuation=false (explicit group header)', () => {
    it('renders Avatar when isContinuation is false', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: false },
      });
      const avatarEl = wrapper.find('.h-8.w-8');
      expect(avatarEl.exists()).toBe(true);
    });

    it('renders display name when isContinuation is false', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: false },
      });
      expect(wrapper.text()).toContain('Test User');
    });

    it('renders timestamp when isContinuation is false', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: false },
      });
      const timeSpan = wrapper.find('.text-muted-foreground.shrink-0');
      expect(timeSpan.exists()).toBe(true);
    });
  });
});
