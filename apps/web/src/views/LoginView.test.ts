import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LoginView from './LoginView.vue';

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

  it('sign-in link uses Google-spec button styling (white background, Google G logo)', () => {
    const wrapper = mount(LoginView);
    const link = wrapper.find('[href="/api/auth/google"]');
    expect(link.classes()).toContain('bg-white');
    expect(link.find('svg').exists()).toBe(true);
    expect(wrapper.text()).toContain('Sign in with Google');
  });

  it('renders the favicon.svg image instead of an emoji', () => {
    const wrapper = mount(LoginView);
    const img = wrapper.find('img[src="/favicon.svg"]');
    expect(img.exists()).toBe(true);
    expect(img.attributes('aria-hidden')).toBe('true');
  });
});
