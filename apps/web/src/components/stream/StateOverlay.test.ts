import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import StateOverlay from './StateOverlay.vue';
import { useStream } from '@/composables/useStream';

const { offlineEmoji, offlineTitle, offlineDescription } = useStream();

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  offlineEmoji.value = null;
  offlineTitle.value = null;
  offlineDescription.value = null;
});

describe('StateOverlay', () => {
  beforeEach(() => {
    import.meta.env.VITE_PET_NAME = 'Buddy';
  });

  describe('unreachable variant', () => {
    it('renders a frosted dark overlay', () => {
      wrapper = mount(StateOverlay, { props: { variant: 'unreachable' } });
      const overlay = wrapper.find('[data-overlay]');
      expect(overlay.exists()).toBe(true);
      const classes = overlay.classes().join(' ');
      expect(classes).toMatch(/backdrop-blur/);
    });

    it('shows an amber spinner', () => {
      wrapper = mount(StateOverlay, { props: { variant: 'unreachable' } });
      const spinner = wrapper.find('[data-spinner]');
      expect(spinner.exists()).toBe(true);
      expect(spinner.classes().join(' ')).toMatch(/animate-spin/);
    });

    it('shows "Trying to reconnect..." text', () => {
      wrapper = mount(StateOverlay, { props: { variant: 'unreachable' } });
      expect(wrapper.text()).toContain('Trying to reconnect...');
    });

    it('shows subtitle copy', () => {
      wrapper = mount(StateOverlay, { props: { variant: 'unreachable' } });
      expect(wrapper.text()).toContain('Oops, looks like the camera went offline. Hang tight.');
    });

    it('does NOT show the explicit-offline emoji img', () => {
      wrapper = mount(StateOverlay, { props: { variant: 'unreachable' } });
      expect(wrapper.find('img').exists()).toBe(false);
    });
  });

  describe('explicit-offline variant — defaults', () => {
    it('renders Fluent emoji img with default sleeping-face codepoint', () => {
      wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      const img = wrapper.find('img');
      expect(img.exists()).toBe(true);
      expect(img.attributes('src')).toBe('/emojis/1f634.svg');
    });

    it('shows default "{PET_NAME} needs their Zzzs" title', () => {
      wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.text()).toContain('Buddy needs their Zzzs');
    });

    it('shows default offline description copy', () => {
      wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.text()).toContain(
        "The stream is offline for now. Check back later — they'll be back.",
      );
    });

    it('does NOT render a spinner', () => {
      wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      const spinner = wrapper.find('[data-spinner]');
      expect(spinner.exists()).toBe(false);
    });

    it('renders the StreamStatusBadge below the copy', () => {
      wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.text()).toContain('Stream is offline');
    });

    it('does NOT render preview button when showPreviewButton is false/omitted', () => {
      wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.find('[data-preview-button]').exists()).toBe(false);
    });

    it('renders preview button when showPreviewButton is true', () => {
      wrapper = mount(StateOverlay, {
        props: { variant: 'explicit-offline', showPreviewButton: true },
      });
      expect(wrapper.find('[data-preview-button]').exists()).toBe(true);
      expect(wrapper.find('[data-preview-button]').text()).toBe('Preview Stream');
    });

    it('emits preview when preview button is clicked', async () => {
      wrapper = mount(StateOverlay, {
        props: { variant: 'explicit-offline', showPreviewButton: true },
      });
      await wrapper.find('[data-preview-button]').trigger('click');
      expect(wrapper.emitted('preview')).toBeTruthy();
    });

    it('does NOT render preview button in unreachable variant even if showPreviewButton=true', () => {
      wrapper = mount(StateOverlay, {
        props: { variant: 'unreachable', showPreviewButton: true },
      });
      expect(wrapper.find('[data-preview-button]').exists()).toBe(false);
    });
  });

  describe('explicit-offline variant — custom values', () => {
    it('uses custom emoji codepoint when offlineEmoji is set', () => {
      offlineEmoji.value = '1f600';
      wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      const img = wrapper.find('img');
      expect(img.attributes('src')).toBe('/emojis/1f600.svg');
    });

    it('uses custom title when offlineTitle is set', () => {
      offlineTitle.value = 'Custom Stream Title';
      wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.text()).toContain('Custom Stream Title');
    });

    it('uses custom description when offlineDescription is set', () => {
      offlineDescription.value = 'Custom offline description here.';
      wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.text()).toContain('Custom offline description here.');
    });

    it('falls back to default title when offlineTitle is null', () => {
      offlineTitle.value = null;
      wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.text()).toContain('Buddy needs their Zzzs');
    });

    it('falls back to default description when offlineDescription is null', () => {
      offlineDescription.value = null;
      wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.text()).toContain(
        "The stream is offline for now. Check back later — they'll be back.",
      );
    });
  });
});
