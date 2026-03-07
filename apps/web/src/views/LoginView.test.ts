import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LoginView from './LoginView.vue';

// Mock ShadCN Button to avoid resolution issues in test environment
vi.mock('@/components/ui/button', () => ({
  Button: {
    name: 'Button',
    props: ['as', 'href', 'size', 'asChild'],
    template: '<a :href="href" v-bind="$attrs"><slot /></a>',
  },
}));

describe('LoginView', () => {
  beforeEach(() => {
    import.meta.env.VITE_SITE_NAME = 'TestCam';
    import.meta.env.VITE_PET_NAME = 'Buddy';
  });

  it('renders SITE_NAME in the heading', () => {
    const wrapper = mount(LoginView);
    expect(wrapper.text()).toContain('TestCam');
  });

  it('renders PET_NAME in the copy', () => {
    const wrapper = mount(LoginView);
    expect(wrapper.text()).toContain('Buddy');
  });

  it('has a link to /api/auth/google', () => {
    const wrapper = mount(LoginView);
    const link = wrapper.find('[href="/api/auth/google"]');
    expect(link.exists()).toBe(true);
  });

  it('uses ShadCN Button component (not a bare unstyled element)', () => {
    const wrapper = mount(LoginView);
    const button = wrapper.findComponent({ name: 'Button' });
    expect(button.exists()).toBe(true);
  });
});
