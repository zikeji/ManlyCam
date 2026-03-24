import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import ClipEditForm from './ClipEditForm.vue';

vi.mock('@/components/ui/button', () => ({
  Button: { template: '<button type="submit"><slot /></button>' },
}));
vi.mock('@/components/ui/switch', () => ({
  Switch: {
    props: ['checked'],
    emits: ['update:checked'],
    template:
      '<input type="checkbox" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" />',
  },
}));

const baseClip = {
  id: 'clip-001',
  userId: 'user-001',
  name: 'My Clip',
  description: null,
  status: 'ready',
  visibility: 'private',
  thumbnailUrl: null,
  durationSeconds: 90,
  showClipper: false,
  showClipperAvatar: false,
  clipperName: null,
  clipperAvatarUrl: null,
  createdAt: '2026-03-22T10:00:00.000Z',
  updatedAt: null,
  lastEditedAt: null,
  clipperDisplayName: 'Test User',
  clipperAvatarUrlOwner: null,
  clipperRole: 'ViewerGuest',
};

let wrapper: ReturnType<typeof mount> | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('ClipEditForm', () => {
  it('renders name input with clip name', () => {
    wrapper = mount(ClipEditForm, { props: { clip: baseClip, userRole: 'ViewerGuest' } });
    const input = wrapper.find('[data-testid="clip-name-input"]') as ReturnType<
      typeof wrapper.find
    >;
    expect((input.element as HTMLInputElement).value).toBe('My Clip');
  });

  it('renders description textarea empty when description is null', () => {
    wrapper = mount(ClipEditForm, { props: { clip: baseClip, userRole: 'ViewerGuest' } });
    const ta = wrapper.find('[data-testid="clip-description-input"]');
    expect((ta.element as HTMLTextAreaElement).value).toBe('');
  });

  it('renders description textarea with existing description', () => {
    wrapper = mount(ClipEditForm, {
      props: { clip: { ...baseClip, description: 'A description' }, userRole: 'ViewerGuest' },
    });
    const ta = wrapper.find('[data-testid="clip-description-input"]');
    expect((ta.element as HTMLTextAreaElement).value).toBe('A description');
  });

  it('shows private and shared options but not public for ViewerGuest', () => {
    wrapper = mount(ClipEditForm, { props: { clip: baseClip, userRole: 'ViewerGuest' } });
    const select = wrapper.find('[data-testid="clip-visibility-select"]');
    expect(select.find('option[value="private"]').exists()).toBe(true);
    expect(select.find('option[value="shared"]').exists()).toBe(true);
    expect(select.find('option[value="public"]').exists()).toBe(false);
  });

  it('shows public option for Moderator', () => {
    wrapper = mount(ClipEditForm, { props: { clip: baseClip, userRole: 'Moderator' } });
    const select = wrapper.find('[data-testid="clip-visibility-select"]');
    expect(select.find('option[value="public"]').exists()).toBe(true);
  });

  it('shows public option for Admin', () => {
    wrapper = mount(ClipEditForm, { props: { clip: baseClip, userRole: 'Admin' } });
    const select = wrapper.find('[data-testid="clip-visibility-select"]');
    expect(select.find('option[value="public"]').exists()).toBe(true);
  });

  it('does not show public option for ViewerCompany', () => {
    wrapper = mount(ClipEditForm, { props: { clip: baseClip, userRole: 'ViewerCompany' } });
    const select = wrapper.find('[data-testid="clip-visibility-select"]');
    expect(select.find('option[value="public"]').exists()).toBe(false);
  });

  it('does not show attribution controls when visibility is private', () => {
    wrapper = mount(ClipEditForm, { props: { clip: baseClip, userRole: 'Moderator' } });
    expect(wrapper.find('[data-testid="show-clipper-switch"]').exists()).toBe(false);
  });

  it('shows attribution controls when visibility is public', async () => {
    wrapper = mount(ClipEditForm, {
      props: { clip: { ...baseClip, visibility: 'public' }, userRole: 'Moderator' },
    });
    await nextTick();
    expect(wrapper.find('[data-testid="show-clipper-switch"]').exists()).toBe(true);
  });

  it('does not show avatar/name controls when showClipper is false', async () => {
    wrapper = mount(ClipEditForm, {
      props: { clip: { ...baseClip, visibility: 'public' }, userRole: 'Moderator' },
    });
    await nextTick();
    expect(wrapper.find('[data-testid="show-clipper-avatar-switch"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="clipper-name-input"]').exists()).toBe(false);
  });

  it('shows avatar and name controls when showClipper is true', async () => {
    wrapper = mount(ClipEditForm, {
      props: {
        clip: { ...baseClip, visibility: 'public', showClipper: true },
        userRole: 'Moderator',
      },
    });
    await nextTick();
    expect(wrapper.find('[data-testid="show-clipper-avatar-switch"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="clipper-name-input"]').exists()).toBe(true);
  });

  it('clipper name input defaults to clipperDisplayName when clipperName is null', async () => {
    wrapper = mount(ClipEditForm, {
      props: {
        clip: { ...baseClip, visibility: 'public', showClipper: true },
        userRole: 'Moderator',
      },
    });
    await nextTick();
    const input = wrapper.find('[data-testid="clipper-name-input"]');
    expect((input.element as HTMLInputElement).value).toBe('Test User');
  });

  it('emits save with only changed fields', async () => {
    wrapper = mount(ClipEditForm, { props: { clip: baseClip, userRole: 'ViewerGuest' } });
    await wrapper.find('[data-testid="clip-name-input"]').setValue('New Name');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('save')).toBeTruthy();
    expect(wrapper.emitted('save')![0][0]).toEqual({ name: 'New Name' });
  });

  it('emits save with empty object when nothing changed', async () => {
    wrapper = mount(ClipEditForm, { props: { clip: baseClip, userRole: 'ViewerGuest' } });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('save')![0][0]).toEqual({});
  });

  it('emits cancel when cancel button clicked', async () => {
    wrapper = mount(ClipEditForm, { props: { clip: baseClip, userRole: 'ViewerGuest' } });
    await wrapper.find('button[type="button"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('resets attribution fields when visibility changes away from public', async () => {
    wrapper = mount(ClipEditForm, {
      props: {
        clip: { ...baseClip, visibility: 'public', showClipper: true, showClipperAvatar: true },
        userRole: 'Moderator',
      },
    });
    await nextTick();
    // Change to shared
    await wrapper.find('[data-testid="clip-visibility-select"]').setValue('shared');
    await nextTick();
    // Submit — attribution fields should be omitted (showAttribution is now false)
    await wrapper.find('form').trigger('submit');
    const emitted = wrapper.emitted('save')![0][0] as Record<string, unknown>;
    expect(emitted.showClipper).toBeUndefined();
    expect(emitted.showClipperAvatar).toBeUndefined();
  });

  it('includes description in save when changed', async () => {
    wrapper = mount(ClipEditForm, {
      props: { clip: { ...baseClip, description: 'old' }, userRole: 'ViewerGuest' },
    });
    await wrapper.find('[data-testid="clip-description-input"]').setValue('new description');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('save')![0][0]).toMatchObject({ description: 'new description' });
  });

  it('includes visibility in save when changed', async () => {
    wrapper = mount(ClipEditForm, { props: { clip: baseClip, userRole: 'Moderator' } });
    await wrapper.find('[data-testid="clip-visibility-select"]').setValue('shared');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('save')![0][0]).toMatchObject({ visibility: 'shared' });
  });

  it('includes showClipperAvatar and clipperName in save when changed under public visibility', async () => {
    wrapper = mount(ClipEditForm, {
      props: {
        clip: {
          ...baseClip,
          visibility: 'public',
          showClipper: true,
          showClipperAvatar: false,
          clipperName: 'Old Name',
          clipperDisplayName: 'Test User',
        },
        userRole: 'Moderator',
      },
    });
    await nextTick();
    const avatarSwitch = wrapper.find('[data-testid="show-clipper-avatar-switch"]');
    await avatarSwitch.setValue(true);
    const nameInput = wrapper.find('[data-testid="clipper-name-input"]');
    await nameInput.setValue('New Name');
    await wrapper.find('form').trigger('submit');
    const emitted = wrapper.emitted('save')![0][0] as Record<string, unknown>;
    expect(emitted.showClipperAvatar).toBe(true);
    expect(emitted.clipperName).toBe('New Name');
  });

  it('includes showClipper in save when changed from false to true under public visibility', async () => {
    wrapper = mount(ClipEditForm, {
      props: { clip: { ...baseClip, visibility: 'public' }, userRole: 'Moderator' },
    });
    await nextTick();
    const switchEl = wrapper.find('[data-testid="show-clipper-switch"]');
    await switchEl.setValue(true);
    await flushPromises();
    await wrapper.find('form').trigger('submit');
    const emitted = wrapper.emitted('save')![0][0] as Record<string, unknown>;
    expect(emitted.showClipper).toBe(true);
  });
});
