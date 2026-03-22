import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import RejectedView from './RejectedView.vue';

describe('RejectedView', () => {
  beforeEach(() => {
    import.meta.env.VITE_SITE_NAME = 'TestCam';
    import.meta.env.VITE_PET_NAME = 'Buddy';
  });

  it('renders invite-only heading', () => {
    const wrapper = mount(RejectedView);
    expect(wrapper.text()).toContain('This stream is invite-only.');
  });

  it('renders SITE_NAME in the copy', () => {
    const wrapper = mount(RejectedView);
    expect(wrapper.text()).toContain('TestCam');
  });

  it('renders PET_NAME in the copy', () => {
    const wrapper = mount(RejectedView);
    expect(wrapper.text()).toContain('Buddy');
  });

  it('contains no links or interactive elements', () => {
    const wrapper = mount(RejectedView);
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('renders lock emoji as Fluent img (1f512.svg)', () => {
    const wrapper = mount(RejectedView);
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/emojis/1f512.svg');
  });
});
