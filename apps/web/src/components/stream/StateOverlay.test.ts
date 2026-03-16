import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import StateOverlay from './StateOverlay.vue';

describe('StateOverlay', () => {
  beforeEach(() => {
    import.meta.env.VITE_PET_NAME = 'Buddy';
  });

  describe('unreachable variant', () => {
    it('renders a frosted dark overlay', () => {
      const wrapper = mount(StateOverlay, { props: { variant: 'unreachable' } });
      // Should have backdrop-blur or bg-black style
      const overlay = wrapper.find('[data-overlay]');
      expect(overlay.exists()).toBe(true);
      const classes = overlay.classes().join(' ');
      expect(classes).toMatch(/backdrop-blur/);
    });

    it('shows an amber spinner', () => {
      const wrapper = mount(StateOverlay, { props: { variant: 'unreachable' } });
      const spinner = wrapper.find('[data-spinner]');
      expect(spinner.exists()).toBe(true);
      expect(spinner.classes().join(' ')).toMatch(/animate-spin/);
    });

    it('shows "Trying to reconnect..." text', () => {
      const wrapper = mount(StateOverlay, { props: { variant: 'unreachable' } });
      expect(wrapper.text()).toContain('Trying to reconnect...');
    });

    it('shows subtitle copy', () => {
      const wrapper = mount(StateOverlay, { props: { variant: 'unreachable' } });
      expect(wrapper.text()).toContain('Oops, looks like the camera went offline. Hang tight.');
    });

    it('does NOT show the sleep emoji', () => {
      const wrapper = mount(StateOverlay, { props: { variant: 'unreachable' } });
      expect(wrapper.text()).not.toContain('😴');
    });
  });

  describe('explicit-offline variant', () => {
    it('shows the 😴 emoji', () => {
      const wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.text()).toContain('😴');
    });

    it('shows "{PET_NAME} needs their Zzzs" copy', () => {
      const wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.text()).toContain('Buddy needs their Zzzs');
    });

    it('shows "The stream is offline for now. Check back later — they\'ll be back." copy', () => {
      const wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.text()).toContain(
        "The stream is offline for now. Check back later — they'll be back.",
      );
    });

    it('does NOT render a spinner', () => {
      const wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      const spinner = wrapper.find('[data-spinner]');
      expect(spinner.exists()).toBe(false);
    });

    it('renders the StreamStatusBadge below the copy', () => {
      const wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.text()).toContain('Stream is offline');
    });

    it('does NOT render preview button when showPreviewButton is false/omitted', () => {
      const wrapper = mount(StateOverlay, { props: { variant: 'explicit-offline' } });
      expect(wrapper.find('[data-preview-button]').exists()).toBe(false);
    });

    it('renders preview button when showPreviewButton is true', () => {
      const wrapper = mount(StateOverlay, {
        props: { variant: 'explicit-offline', showPreviewButton: true },
      });
      expect(wrapper.find('[data-preview-button]').exists()).toBe(true);
      expect(wrapper.find('[data-preview-button]').text()).toBe('Preview Stream');
    });

    it('emits preview when preview button is clicked', async () => {
      const wrapper = mount(StateOverlay, {
        props: { variant: 'explicit-offline', showPreviewButton: true },
      });
      await wrapper.find('[data-preview-button]').trigger('click');
      expect(wrapper.emitted('preview')).toBeTruthy();
    });

    it('does NOT render preview button in unreachable variant even if showPreviewButton=true', () => {
      const wrapper = mount(StateOverlay, {
        props: { variant: 'unreachable', showPreviewButton: true },
      });
      expect(wrapper.find('[data-preview-button]').exists()).toBe(false);
    });
  });
});
