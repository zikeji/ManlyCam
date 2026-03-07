import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import BannedView from './BannedView.vue';

describe('BannedView', () => {
  beforeEach(() => {
    import.meta.env.VITE_SITE_NAME = 'TestCam';
  });

  it('renders account suspended heading', () => {
    const wrapper = mount(BannedView);
    expect(wrapper.text()).toContain('Account Suspended');
  });

  it('renders SITE_NAME in the copy', () => {
    const wrapper = mount(BannedView);
    expect(wrapper.text()).toContain('TestCam');
  });

  it('contains no links or interactive elements', () => {
    const wrapper = mount(BannedView);
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
  });
});
