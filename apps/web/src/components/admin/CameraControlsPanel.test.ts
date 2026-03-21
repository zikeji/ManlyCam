import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import CameraControlsPanel from './CameraControlsPanel.vue';

// Stub CameraControls to avoid its composable/stream dependencies
vi.mock('./CameraControls.vue', () => ({
  default: { name: 'CameraControls', template: '<div data-camera-controls />' },
}));

describe('CameraControlsPanel.vue', () => {
  let wrapper: ReturnType<typeof mount<typeof CameraControlsPanel>> | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders "Camera Controls" header', () => {
    wrapper = mount(CameraControlsPanel);
    expect(wrapper.text()).toContain('Camera Controls');
  });

  it('renders CameraControls', () => {
    wrapper = mount(CameraControlsPanel);
    expect(wrapper.find('[data-camera-controls]').exists()).toBe(true);
  });

  it('shows close button by default', () => {
    wrapper = mount(CameraControlsPanel);
    expect(wrapper.find('button[aria-label="Close panel"]').exists()).toBe(true);
  });

  it('hides close button when showClose is false', () => {
    wrapper = mount(CameraControlsPanel, { props: { showClose: false } });
    expect(wrapper.find('button[aria-label="Close panel"]').exists()).toBe(false);
  });

  it('emits close when close button is clicked', async () => {
    wrapper = mount(CameraControlsPanel);
    await wrapper.find('button[aria-label="Close panel"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('passes previewActive=true attribute to CameraControls when prop is true', () => {
    wrapper = mount(CameraControlsPanel, { props: { previewActive: true } });
    expect(wrapper.props('previewActive')).toBe(true);
  });

  it('defaults previewActive to false', () => {
    wrapper = mount(CameraControlsPanel);
    expect(wrapper.props('previewActive')).toBe(false);
  });
});
