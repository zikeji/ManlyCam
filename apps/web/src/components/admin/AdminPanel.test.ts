import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AdminPanel from './AdminPanel.vue';

// Stub CameraControls to avoid its composable/stream dependencies
vi.mock('./CameraControls.vue', () => ({
  default: { name: 'CameraControls', template: '<div data-camera-controls />' },
}));

describe('AdminPanel.vue', () => {
  it('renders "Camera Controls" header', () => {
    const wrapper = mount(AdminPanel);
    expect(wrapper.text()).toContain('Camera Controls');
  });

  it('renders CameraControls', () => {
    const wrapper = mount(AdminPanel);
    expect(wrapper.find('[data-camera-controls]').exists()).toBe(true);
  });

  it('shows close button by default', () => {
    const wrapper = mount(AdminPanel);
    expect(wrapper.find('button[aria-label="Close panel"]').exists()).toBe(true);
  });

  it('hides close button when showClose is false', () => {
    const wrapper = mount(AdminPanel, { props: { showClose: false } });
    expect(wrapper.find('button[aria-label="Close panel"]').exists()).toBe(false);
  });

  it('emits close when close button is clicked', async () => {
    const wrapper = mount(AdminPanel);
    await wrapper.find('button[aria-label="Close panel"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
