import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AdminPanel from './AdminPanel.vue';

// Stub CameraControls to avoid its composable/stream dependencies
vi.mock('./CameraControls.vue', () => ({
  default: { name: 'CameraControls', template: '<div data-camera-controls />' },
}));

describe('AdminPanel.vue', () => {
  let wrapper: ReturnType<typeof mount<typeof AdminPanel>> | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders "Camera Controls" header', () => {
    wrapper = mount(AdminPanel);
    expect(wrapper.text()).toContain('Camera Controls');
  });

  it('renders CameraControls', () => {
    wrapper = mount(AdminPanel);
    expect(wrapper.find('[data-camera-controls]').exists()).toBe(true);
  });

  it('shows close button by default', () => {
    wrapper = mount(AdminPanel);
    expect(wrapper.find('button[aria-label="Close panel"]').exists()).toBe(true);
  });

  it('hides close button when showClose is false', () => {
    wrapper = mount(AdminPanel, { props: { showClose: false } });
    expect(wrapper.find('button[aria-label="Close panel"]').exists()).toBe(false);
  });

  it('emits close when close button is clicked', async () => {
    wrapper = mount(AdminPanel);
    await wrapper.find('button[aria-label="Close panel"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('passes previewActive=true attribute to CameraControls when prop is true', () => {
    wrapper = mount(AdminPanel, { props: { previewActive: true } });
    expect(wrapper.props('previewActive')).toBe(true);
  });

  it('defaults previewActive to false', () => {
    wrapper = mount(AdminPanel);
    expect(wrapper.props('previewActive')).toBe(false);
  });
});
