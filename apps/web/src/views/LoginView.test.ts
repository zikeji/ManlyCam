import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import LoginView from './LoginView.vue';

// Mock ShadCN Button — handles asChild by rendering slot directly (no wrapper)
vi.mock('@/components/ui/button', () => ({
  Button: defineComponent({
    name: 'Button',
    props: { as: String, href: String, size: String, asChild: Boolean },
    inheritAttrs: false,
    setup(props, { slots, attrs }) {
      return () => {
        if (props.asChild && slots.default) {
          return slots.default();
        }
        return h(props.as || 'button', { ...attrs, href: props.href }, slots.default?.());
      };
    },
  }),
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

  it('uses ShadCN Button component with asChild and size props (not a bare unstyled element)', () => {
    const wrapper = mount(LoginView);
    const button = wrapper.findComponent({ name: 'Button' });
    expect(button.exists()).toBe(true);
    expect(button.props('asChild')).toBe(true);
    expect(button.props('size')).toBe('lg');
  });
});
