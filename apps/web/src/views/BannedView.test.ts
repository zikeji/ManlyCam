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

  it('renders no-entry emoji as Fluent img (1f6ab.svg)', () => {
    const wrapper = mount(BannedView);
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/emojis/1f6ab.svg');
  });
});
