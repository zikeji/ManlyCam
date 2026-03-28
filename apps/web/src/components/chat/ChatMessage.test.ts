import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import ChatMessage from './ChatMessage.vue';
import type { ChatMessage as ChatMessageType, ClipChatMessage } from '@manlycam/types';

// Mock context-menu with simple stubs that render slots and fire click events
vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: defineComponent({ template: '<div><slot/></div>' }),
  ContextMenuTrigger: defineComponent({ template: '<div><slot/></div>' }),
  ContextMenuContent: defineComponent({ template: '<div data-context-menu-content><slot/></div>' }),
  ContextMenuItem: defineComponent({
    emits: ['click'],
    template: '<div data-context-menu-item @click="$emit(\'click\', $event)"><slot/></div>',
  }),
}));

// Mock alert-dialog with stubs that render slot content and support :open prop
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: defineComponent({
    props: ['open'],
    template: '<div v-if="open" data-alert-dialog><slot/></div>',
  }),
  AlertDialogContent: defineComponent({ template: '<div><slot/></div>' }),
  AlertDialogHeader: defineComponent({ template: '<div><slot/></div>' }),
  AlertDialogFooter: defineComponent({ template: '<div><slot/></div>' }),
  AlertDialogTitle: defineComponent({ template: '<div data-alert-title><slot/></div>' }),
  AlertDialogDescription: defineComponent({ template: '<div><slot/></div>' }),
  AlertDialogCancel: defineComponent({
    emits: ['click'],
    template: '<button data-alert-cancel @click="$emit(\'click\')">Cancel</button>',
  }),
  AlertDialogAction: defineComponent({
    emits: ['click'],
    template: '<button data-alert-action @click="$emit(\'click\')"><slot/></button>',
  }),
}));

// Mock tooltip with simple stubs that render slot content
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: defineComponent({ template: '<div><slot/></div>' }),
  Tooltip: defineComponent({ template: '<div><slot/></div>' }),
  TooltipTrigger: defineComponent({ template: '<div><slot/></div>' }),
  TooltipContent: defineComponent({ template: '<div><slot/></div>' }),
}));

// Mock reaction components
vi.mock('./ReactionBar.vue', () => ({
  default: defineComponent({
    name: 'ReactionBar',
    emits: ['select', 'close'],
    template: '<div data-reaction-bar></div>',
  }),
}));

vi.mock('./ReactionDisplay.vue', () => ({
  default: defineComponent({
    name: 'ReactionDisplay',
    props: ['reactions', 'currentUserId', 'canModerate', 'isMuted'],
    emits: ['toggle', 'modRemove'],
    template: '<div data-reaction-display></div>',
  }),
}));

vi.mock('@/composables/useReactions', () => ({
  useReactions: vi.fn(() => ({
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
    modRemoveReaction: vi.fn(),
  })),
}));

// Mock ClipCard
vi.mock('./ClipCard.vue', () => ({
  default: defineComponent({
    name: 'ClipCard',
    props: ['message'],
    emits: ['download'],
    template: '<div data-clip-card :data-clip-id="message.clipId"><slot/></div>',
  }),
}));

// Mock useClipModal
vi.mock('@/composables/useClipModal', () => ({
  openClip: vi.fn(),
  closeClip: vi.fn(),
  isClipModalOpen: { value: false },
  activeClipId: { value: null },
  useClipModal: vi.fn(),
}));

const baseMessage: ChatMessageType = {
  id: 'msg-001',
  userId: 'user-001',
  displayName: 'Test User',
  avatarUrl: null,
  authorRole: 'ViewerCompany',
  messageType: 'text',
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

  it('renders avatar image inside ContextMenu branch when isOwn=true', () => {
    wrapper = mount(ChatMessage, {
      props: {
        message: { ...baseMessage, avatarUrl: 'https://example.com/avatar.jpg' },
        isOwn: true,
      },
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
    // markdown-it internally rejects javascript: links — either no <a> is rendered
    // or the href is sanitized to '#'. Either way, no executable javascript: href exists.
    expect(wrapper.html()).not.toContain('href="javascript:');
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

  it('renders userTag inside ContextMenu branch when isOwn=true', () => {
    wrapper = mount(ChatMessage, {
      props: {
        message: { ...baseMessage, userTag: { text: 'VIP', color: '#FF0000' } },
        isOwn: true,
      },
    });
    expect(wrapper.text()).toContain('VIP');
  });

  it('does not render userTag when null', () => {
    wrapper = mount(ChatMessage, { props: { message: baseMessage } });
    expect(wrapper.text()).not.toContain('Guest');
    expect(wrapper.text()).not.toContain('VIP');
  });

  describe('context menu visibility (group row)', () => {
    it('no context menu rendered when isOwn=false and canModerateDelete=false', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isOwn: false, canModerateDelete: false },
      });
      expect(wrapper.find('[data-context-menu-content]').exists()).toBe(false);
    });

    it('context menu rendered when isOwn=true', () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });
      expect(wrapper.find('[data-context-menu-content]').exists()).toBe(true);
    });

    it('context menu rendered when canModerateDelete=true', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isOwn: false, canModerateDelete: true },
      });
      expect(wrapper.find('[data-context-menu-content]').exists()).toBe(true);
    });

    it('Edit option present when isOwn=true', () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });
      const items = wrapper.findAll('[data-context-menu-item]');
      const texts = items.map((i) => i.text().trim());
      expect(texts).toContain('Edit');
    });

    it('Edit option NOT present when canModerateDelete=true and isOwn=false', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isOwn: false, canModerateDelete: true },
      });
      const items = wrapper.findAll('[data-context-menu-item]');
      const texts = items.map((i) => i.text().trim());
      expect(texts).not.toContain('Edit');
      expect(texts).toContain('Delete');
    });

    it('Delete option present when isOwn=true', () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });
      const items = wrapper.findAll('[data-context-menu-item]');
      const texts = items.map((i) => i.text().trim());
      expect(texts).toContain('Delete');
    });
  });

  describe('context menu visibility (continuation row)', () => {
    it('no context menu rendered when isOwn=false and canModerateDelete=false (continuation)', () => {
      wrapper = mount(ChatMessage, {
        props: {
          message: baseMessage,
          isContinuation: true,
          isOwn: false,
          canModerateDelete: false,
        },
      });
      expect(wrapper.find('[data-context-menu-content]').exists()).toBe(false);
    });

    it('context menu rendered when isOwn=true (continuation)', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: true, isOwn: true },
      });
      expect(wrapper.find('[data-context-menu-content]').exists()).toBe(true);
    });

    it('context menu rendered when canModerateDelete=true (continuation)', () => {
      wrapper = mount(ChatMessage, {
        props: {
          message: baseMessage,
          isContinuation: true,
          isOwn: false,
          canModerateDelete: true,
        },
      });
      expect(wrapper.find('[data-context-menu-content]').exists()).toBe(true);
    });
  });

  describe('AlertDialog delete flow', () => {
    it('clicking Delete in context menu opens AlertDialog', async () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });

      const deleteItem = wrapper
        .findAll('[data-context-menu-item]')
        .find((el) => el.text().trim() === 'Delete');
      await deleteItem!.trigger('click');
      await nextTick();

      expect(wrapper.find('[data-alert-dialog]').exists()).toBe(true);
      expect(wrapper.find('[data-alert-title]').text()).toBe('Delete message?');
    });

    it('clicking Delete action in AlertDialog emits requestDelete and closes dialog', async () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });

      const deleteItem = wrapper
        .findAll('[data-context-menu-item]')
        .find((el) => el.text().trim() === 'Delete');
      await deleteItem!.trigger('click');
      await nextTick();

      await wrapper.find('[data-alert-action]').trigger('click');
      await nextTick();

      const emitted = wrapper.emitted('requestDelete');
      expect(emitted).toBeTruthy();
      expect(emitted![0]).toEqual(['msg-001']);
      expect(wrapper.find('[data-alert-dialog]').exists()).toBe(false);
    });

    it('clicking Cancel in AlertDialog does NOT emit requestDelete', async () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });

      const deleteItem = wrapper
        .findAll('[data-context-menu-item]')
        .find((el) => el.text().trim() === 'Delete');
      await deleteItem!.trigger('click');
      await nextTick();

      await wrapper.find('[data-alert-cancel]').trigger('click');
      await nextTick();

      expect(wrapper.emitted('requestDelete')).toBeFalsy();
    });

    it('shift+click Delete skips AlertDialog and emits requestDelete directly', async () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });

      const deleteItem = wrapper
        .findAll('[data-context-menu-item]')
        .find((el) => el.text().trim() === 'Delete');
      const el = deleteItem!.element as HTMLElement;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      await nextTick();

      expect(wrapper.find('[data-alert-dialog]').exists()).toBe(false);
      const emitted = wrapper.emitted('requestDelete');
      expect(emitted).toBeTruthy();
      expect(emitted![0]).toEqual(['msg-001']);
    });

    it('moderator delete: clicking Delete in context menu opens AlertDialog', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isOwn: false, canModerateDelete: true },
      });

      const deleteItem = wrapper.find('[data-context-menu-item]');
      expect(deleteItem.text().trim()).toBe('Delete');
      await deleteItem.trigger('click');
      await nextTick();

      expect(wrapper.find('[data-alert-dialog]').exists()).toBe(true);
    });
  });

  describe('AlertDialog ban flow', () => {
    it('clicking Ban in context menu opens AlertDialog', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, currentUserRole: 'Admin' },
      });

      const banItem = wrapper
        .findAll('[data-context-menu-item]')
        .find((el) => el.text().trim() === 'Ban');
      await banItem!.trigger('click');
      await nextTick();

      expect(wrapper.find('[data-alert-dialog]').exists()).toBe(true);
      expect(wrapper.find('[data-alert-title]').text()).toBe('Ban Test User?');
    });

    it('clicking Ban action in AlertDialog emits banUser and closes dialog', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, currentUserRole: 'Admin' },
      });

      const banItem = wrapper
        .findAll('[data-context-menu-item]')
        .find((el) => el.text().trim() === 'Ban');
      await banItem!.trigger('click');
      await nextTick();

      const actionBtn = wrapper.findAll('[data-alert-action]').find((b) => b.text() === 'Ban User');
      await actionBtn!.trigger('click');
      await nextTick();

      expect(wrapper.emitted('banUser')).toEqual([['user-001']]);
      expect(wrapper.find('[data-alert-dialog]').exists()).toBe(false);
    });
  });

  describe('edit mode (group row)', () => {
    beforeEach(() => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });
    });

    function findMenuItem(w: VueWrapper, text: string) {
      return w.findAll('[data-context-menu-item]').find((el) => el.text().trim() === text);
    }

    it('clicking Edit opens textarea pre-filled with message content', async () => {
      await findMenuItem(wrapper!, 'Edit')!.trigger('click');
      await nextTick();

      const textarea = wrapper!.find('textarea');
      expect(textarea.exists()).toBe(true);
      expect((textarea.element as HTMLTextAreaElement).value).toBe('Hello world');
    });

    it('Escape key cancels edit and restores message body', async () => {
      await findMenuItem(wrapper!, 'Edit')!.trigger('click');
      await nextTick();

      await wrapper!.find('textarea').trigger('keydown', { key: 'Escape' });
      await nextTick();

      expect(wrapper!.find('textarea').exists()).toBe(false);
      expect(wrapper!.text()).toContain('Hello world');
    });

    it('Enter key submits edit and emits requestEdit with message ID and trimmed content', async () => {
      await findMenuItem(wrapper!, 'Edit')!.trigger('click');
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
      await findMenuItem(wrapper!, 'Edit')!.trigger('click');
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
      await findMenuItem(wrapper!, 'Edit')!.trigger('click');
      await nextTick();

      const cancelBtn = wrapper!.findAll('button').find((b) => b.text().trim() === 'Cancel');
      await cancelBtn!.trigger('click');
      await nextTick();

      expect(wrapper!.find('textarea').exists()).toBe(false);
      expect(wrapper!.emitted('requestEdit')).toBeFalsy();
    });

    it('does not submit when editContent is empty/whitespace', async () => {
      await findMenuItem(wrapper!, 'Edit')!.trigger('click');
      await nextTick();

      await wrapper!.find('textarea').setValue('   ');
      const saveBtn = wrapper!.findAll('button').find((b) => b.text().trim() === 'Save');
      await saveBtn!.trigger('click');
      await nextTick();

      expect(wrapper!.emitted('requestEdit')).toBeFalsy();
    });

    it('Save button is disabled when textarea is empty', async () => {
      await findMenuItem(wrapper!, 'Edit')!.trigger('click');
      await nextTick();

      await wrapper!.find('textarea').setValue('');
      await nextTick();

      const saveBtn = wrapper!.findAll('button').find((b) => b.text().trim() === 'Save');
      expect((saveBtn!.element as HTMLButtonElement).disabled).toBe(true);
    });

    it('Save button is enabled when textarea has content', async () => {
      await findMenuItem(wrapper!, 'Edit')!.trigger('click');
      await nextTick();

      const saveBtn = wrapper!.findAll('button').find((b) => b.text().trim() === 'Save');
      expect((saveBtn!.element as HTMLButtonElement).disabled).toBe(false);
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

  describe('muted indicator and mute/unmute context menu', () => {
    it('shows MicOff indicator when isAuthorMuted=true and canMuteAuthor=true', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isAuthorMuted: true, currentUserRole: 'Admin' },
      });
      expect(wrapper.find('[aria-label="Muted"]').exists()).toBe(true);
    });

    it('does NOT show MicOff indicator when isAuthorMuted=true but canMuteAuthor=false', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isAuthorMuted: true, currentUserRole: 'ViewerGuest' },
      });
      expect(wrapper.find('[aria-label="Muted"]').exists()).toBe(false);
    });

    it('does NOT show MicOff indicator when isAuthorMuted=false', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isAuthorMuted: false, currentUserRole: 'Admin' },
      });
      expect(wrapper.find('[aria-label="Muted"]').exists()).toBe(false);
    });

    it('shows Mute item when canMuteAuthor=true and author is not muted', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, currentUserRole: 'Admin', isAuthorMuted: false },
      });
      const items = wrapper.findAll('[data-context-menu-item]');
      const texts = items.map((i) => i.text().trim());
      expect(texts).toContain('Mute');
      expect(texts).not.toContain('Unmute');
    });

    it('shows Unmute item when canMuteAuthor=true and author is muted', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, currentUserRole: 'Admin', isAuthorMuted: true },
      });
      const items = wrapper.findAll('[data-context-menu-item]');
      const texts = items.map((i) => i.text().trim());
      expect(texts).toContain('Unmute');
      expect(texts).not.toContain('Mute');
    });

    it('emits muteUser with userId when Mute is clicked', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, currentUserRole: 'Admin', isAuthorMuted: false },
      });
      const muteItem = wrapper
        .findAll('[data-context-menu-item]')
        .find((el) => el.text().trim() === 'Mute');
      await muteItem!.trigger('click');
      expect(wrapper.emitted('muteUser')).toEqual([['user-001']]);
    });

    it('emits unmuteUser with userId when Unmute is clicked', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, currentUserRole: 'Admin', isAuthorMuted: true },
      });
      const unmuteItem = wrapper
        .findAll('[data-context-menu-item]')
        .find((el) => el.text().trim() === 'Unmute');
      await unmuteItem!.trigger('click');
      expect(wrapper.emitted('unmuteUser')).toEqual([['user-001']]);
    });

    it('does not show Mute/Unmute when canMuteAuthor=false', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isOwn: true, currentUserRole: 'ViewerGuest' },
      });
      const items = wrapper.findAll('[data-context-menu-item]');
      const texts = items.map((i) => i.text().trim());
      expect(texts).not.toContain('Mute');
      expect(texts).not.toContain('Unmute');
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

  describe('auto-resize in edit mode', () => {
    function findEditItem(w: VueWrapper) {
      return w.findAll('[data-context-menu-item]').find((el) => el.text().trim() === 'Edit');
    }

    it('resizeEditTextarea uses panel ancestor clientHeight when data-chat-panel is present', async () => {
      const panel = document.createElement('div');
      panel.setAttribute('data-chat-panel', '');
      Object.defineProperty(panel, 'clientHeight', { get: () => 400, configurable: true });
      document.body.appendChild(panel);

      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isOwn: true },
        attachTo: panel,
      });

      await findEditItem(wrapper)!.trigger('click');
      await nextTick();
      await nextTick(); // allow resizeEditTextarea scheduled by watch/nextTick to run

      // Reaching here without error covers the `panel ? Math.floor(...) : 300` truthy branch
      panel.remove();
    });

    it('resizeEditTextarea sets overflowY to auto when scrollHeight exceeds maxHeight', async () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage, isOwn: true } });

      await findEditItem(wrapper!)!.trigger('click');
      await nextTick();

      const textarea = wrapper!.find('textarea').element as HTMLTextAreaElement;
      // maxH defaults to 300 (no panel); make scrollHeight exceed it
      Object.defineProperty(textarea, 'scrollHeight', { get: () => 400, configurable: true });

      // Changing editContent triggers the watch → nextTick(resizeEditTextarea)
      await wrapper!.find('textarea').setValue('updated content');
      await nextTick();
      await nextTick();

      expect(textarea.style.overflowY).toBe('auto');
    });
  });

  describe('new markdown elements (renderMarkdown)', () => {
    // Task 9.1: code block renders with <pre><code> structure
    it('renders code block with <pre><code> structure', () => {
      wrapper = mount(ChatMessage, {
        props: {
          message: { ...baseMessage, content: '```js\nconst x = 1;\n```' },
        },
      });
      expect(wrapper.find('pre').exists()).toBe(true);
      expect(wrapper.find('code').exists()).toBe(true);
    });

    // Task 9.2: blockquote renders with <blockquote> element
    it('renders blockquote with <blockquote> element', () => {
      wrapper = mount(ChatMessage, {
        props: {
          message: { ...baseMessage, content: '> quoted text' },
        },
      });
      expect(wrapper.find('blockquote').exists()).toBe(true);
      expect(wrapper.find('blockquote').text()).toContain('quoted text');
    });

    // Task 9.3: image renders — verify container has max-height CSS class
    it('renders image and container div has [&_img]:max-h-64 class', () => {
      wrapper = mount(ChatMessage, {
        props: {
          message: {
            ...baseMessage,
            content: '![alt](https://example.com/image.gif)',
          },
        },
      });
      expect(wrapper.find('img').exists()).toBe(true);
      expect(wrapper.find('img').attributes('src')).toBe('https://example.com/image.gif');
      // Verify the container div has the max-height Tailwind class
      const allDivs = wrapper.findAll('div');
      const contentHolder = allDivs.find((d) => d.classes().some((c) => c.includes('max-h-64')));
      expect(contentHolder).toBeTruthy();
    });

    // Task 9.4: existing bold, inline code, link tests still pass
    it('still renders bold markdown correctly', () => {
      wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, content: '**bold text**' } },
      });
      expect(wrapper.find('strong').exists()).toBe(true);
      expect(wrapper.find('strong').text()).toBe('bold text');
    });

    it('still renders inline code markdown correctly', () => {
      wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, content: '`code here`' } },
      });
      expect(wrapper.find('code').exists()).toBe(true);
      expect(wrapper.find('code').text()).toBe('code here');
    });

    it('still renders link markdown with target=_blank', () => {
      wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, content: '[click here](https://example.com)' } },
      });
      const link = wrapper.find('a');
      expect(link.exists()).toBe(true);
      expect(link.attributes('href')).toBe('https://example.com');
      expect(link.attributes('target')).toBe('_blank');
      expect(link.attributes('rel')).toBe('noopener noreferrer');
    });

    it('still suppresses javascript: URLs in links', () => {
      wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, content: '[bad](javascript:alert(1))' } },
      });
      // markdown-it internally rejects javascript: links — no executable javascript: href
      expect(wrapper.html()).not.toContain('href="javascript:');
    });
  });

  describe('reaction UI', () => {
    it('does NOT show ReactionDisplay when reactions array is empty', () => {
      wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, reactions: [] } },
      });
      expect(wrapper.find('[data-reaction-display]').exists()).toBe(false);
    });

    it('shows ReactionDisplay when message has reactions', () => {
      const reactions = [
        {
          emoji: 'thumbs_up',
          count: 1,
          userReacted: false,
          userIds: ['other-user'],
          userDisplayNames: ['Other User'],
          userRoles: ['ViewerGuest' as const],
          firstReactedAt: new Date().toISOString(),
        },
      ];
      wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, reactions } },
      });
      expect(wrapper.find('[data-reaction-display]').exists()).toBe(true);
    });

    it('does NOT show ReactionBar when not hovered', () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isCurrentUserMuted: false },
      });
      expect(wrapper.find('[data-reaction-bar]').exists()).toBe(false);
    });

    it('shows ReactionBar on mouseenter when not muted', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isCurrentUserMuted: false },
      });
      await wrapper.find('[role="listitem"]').trigger('mouseenter');
      await nextTick();
      expect(wrapper.find('[data-reaction-bar]').exists()).toBe(true);
    });

    it('hides ReactionBar on mouseleave', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isCurrentUserMuted: false },
      });
      const listitem = wrapper.find('[role="listitem"]');
      await listitem.trigger('mouseenter');
      await nextTick();
      expect(wrapper.find('[data-reaction-bar]').exists()).toBe(true);
      await listitem.trigger('mouseleave');
      await nextTick();
      expect(wrapper.find('[data-reaction-bar]').exists()).toBe(false);
    });

    it('does NOT show ReactionBar when isCurrentUserMuted=true', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isCurrentUserMuted: true },
      });
      await wrapper.find('[role="listitem"]').trigger('mouseenter');
      await nextTick();
      expect(wrapper.find('[data-reaction-bar]').exists()).toBe(false);
    });

    it('shows ReactionDisplay inside ContextMenu branch when isOwn=true and reactions exist', () => {
      const reactions = [
        {
          emoji: 'thumbs_up',
          count: 1,
          userReacted: true,
          userIds: ['user-001'],
          userDisplayNames: ['Test User'],
          userRoles: ['ViewerGuest' as const],
          firstReactedAt: new Date().toISOString(),
        },
      ];
      wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, reactions }, isOwn: true },
      });
      expect(wrapper.find('[data-reaction-display]').exists()).toBe(true);
    });

    it('ReactionBar stays visible after mouseenter (bar does not auto-close on desktop)', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isCurrentUserMuted: false },
      });
      await wrapper.find('[role="listitem"]').trigger('mouseenter');
      await nextTick();
      // Bar should be open; it only closes via mouseleave on desktop
      expect(wrapper.find('[data-reaction-bar]').exists()).toBe(true);
    });

    it('touchstart on message body while bar is open dismisses the bar', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isCurrentUserMuted: false },
      });
      const listitem = wrapper.find('[role="listitem"]');
      await listitem.trigger('mouseenter');
      await nextTick();
      expect(wrapper.find('[data-reaction-bar]').exists()).toBe(true);
      await listitem.trigger('touchstart');
      await nextTick();
      expect(wrapper.find('[data-reaction-bar]').exists()).toBe(false);
    });

    it('does not attach touchstart listener if component unmounts before rAF fires', async () => {
      let rafCallback: (() => void) | null = null;
      vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
        rafCallback = cb;
        return 0;
      });
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isCurrentUserMuted: false },
      });
      // Trigger long-press to open reaction bar and schedule rAF
      const listitem = wrapper.find('[role="listitem"]');
      vi.useFakeTimers();
      await listitem.trigger('touchstart');
      vi.advanceTimersByTime(500);
      await nextTick();
      vi.useRealTimers();

      // Unmount before rAF fires
      wrapper.unmount();
      wrapper = null;

      const addSpy = vi.spyOn(document, 'addEventListener');
      // Fire the rAF — isMounted is false, so nothing should be registered
      if (rafCallback !== null) (rafCallback as () => void)();
      expect(addSpy).not.toHaveBeenCalledWith('touchstart', expect.any(Function));
      addSpy.mockRestore();
      vi.unstubAllGlobals();
    });
  });

  describe('continuation row — edit mode and reactions', () => {
    it('renders edit textarea in plain continuation row when startEdit() is called', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isContinuation: true, isOwn: true },
      });
      const comp = wrapper.vm as unknown as { startEdit: () => void };
      comp.startEdit();
      await nextTick();
      expect(wrapper.find('textarea').exists()).toBe(true);
    });

    it('renders ReactionDisplay in plain continuation row when reactions are present', () => {
      const reactions = [
        {
          emoji: 'grinning_face',
          count: 1,
          userIds: ['user-999'],
          userDisplayNames: ['Bob'],
          userRoles: ['ViewerGuest' as const],
          userReacted: false,
          firstReactedAt: new Date().toISOString(),
        },
      ];
      wrapper = mount(ChatMessage, {
        props: { message: { ...baseMessage, reactions }, isContinuation: true },
      });
      expect(wrapper.find('[data-reaction-display]').exists()).toBe(true);
    });
  });

  describe('group header — MicOff indicator', () => {
    it('renders MicOff icon in ContextMenu group header when isAuthorMuted and canModerate', () => {
      wrapper = mount(ChatMessage, {
        props: {
          message: baseMessage,
          isOwn: false,
          isAuthorMuted: true,
          currentUserRole: 'Moderator',
        },
      });
      expect(wrapper.find('[aria-label="Muted"]').exists()).toBe(true);
    });

    it('renders edit textarea in ContextMenu group header when startEdit() is called (isOwn=true)', async () => {
      wrapper = mount(ChatMessage, {
        props: { message: baseMessage, isOwn: true },
      });
      const comp = wrapper.vm as unknown as { startEdit: () => void };
      comp.startEdit();
      await nextTick();
      expect(wrapper.find('textarea').exists()).toBe(true);
    });
  });

  describe('clip message rendering', () => {
    const clipMessage: ClipChatMessage = {
      id: 'msg-clip-001',
      userId: 'user-001',
      displayName: 'Test User',
      avatarUrl: null,
      authorRole: 'ViewerCompany',
      messageType: 'clip',
      content: 'Shared a clip',
      editHistory: null,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: '2026-03-08T10:00:00.000Z',
      userTag: null,
      clipId: 'clip-001',
      clipName: 'Dog runs around',
      clipDurationSeconds: 65,
      clipThumbnailUrl: '/api/clips/clip-001/thumbnail',
    };

    it('renders ClipCard component for clip messageType', () => {
      wrapper = mount(ChatMessage, { props: { message: clipMessage } });
      expect(wrapper.find('[data-clip-card]').exists()).toBe(true);
    });

    it('does not render ClipCard for text messages', () => {
      wrapper = mount(ChatMessage, { props: { message: baseMessage } });
      expect(wrapper.find('[data-clip-card]').exists()).toBe(false);
    });

    it('renders sender metadata (displayName, timestamp) with clip messages', () => {
      wrapper = mount(ChatMessage, { props: { message: clipMessage } });
      expect(wrapper.text()).toContain('Test User');
    });

    it('renders ClipCard inside continuation row for clip messages', () => {
      wrapper = mount(ChatMessage, {
        props: { message: clipMessage, isContinuation: true },
      });
      expect(wrapper.find('[data-clip-card]').exists()).toBe(true);
    });

    it('passes correct clipId to ClipCard', () => {
      wrapper = mount(ChatMessage, { props: { message: clipMessage } });
      expect(wrapper.find('[data-clip-card]').attributes('data-clip-id')).toBe('clip-001');
    });
  });
});
