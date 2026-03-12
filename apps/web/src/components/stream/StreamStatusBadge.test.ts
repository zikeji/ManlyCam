import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import StreamStatusBadge from './StreamStatusBadge.vue';

describe('StreamStatusBadge', () => {
  beforeEach(() => {
    import.meta.env.VITE_PET_NAME = 'Buddy';
  });

  it('wrapper has aria-live="polite"', () => {
    const wrapper = mount(StreamStatusBadge, { props: { state: 'connecting' } });
    expect(wrapper.attributes('aria-live')).toBe('polite');
  });

  it('connecting: shows amber dot and "Connecting..." text', () => {
    const wrapper = mount(StreamStatusBadge, { props: { state: 'connecting' } });
    expect(wrapper.text()).toContain('Connecting...');
    const dot = wrapper.find('[data-state-dot]');
    expect(dot.exists()).toBe(true);
    expect(dot.classes().join(' ')).toMatch(/amber|reconnecting/);
  });

  it('live: shows green pulsing dot and "{PET_NAME} is live"', () => {
    const wrapper = mount(StreamStatusBadge, { props: { state: 'live' } });
    expect(wrapper.text()).toContain('Buddy is live');
    const dot = wrapper.find('[data-state-dot]');
    expect(dot.exists()).toBe(true);
    expect(dot.classes().join(' ')).toMatch(/live|green|animate-pulse/);
  });

  it('unreachable: shows amber dot and "Trying to reconnect..."', () => {
    const wrapper = mount(StreamStatusBadge, { props: { state: 'unreachable' } });
    expect(wrapper.text()).toContain('Trying to reconnect...');
    const dot = wrapper.find('[data-state-dot]');
    expect(dot.exists()).toBe(true);
    expect(dot.classes().join(' ')).toMatch(/amber|reconnecting/);
  });

  it('explicit-offline: shows muted dot and "Stream is offline"', () => {
    const wrapper = mount(StreamStatusBadge, { props: { state: 'explicit-offline' } });
    expect(wrapper.text()).toContain('Stream is offline');
    const dot = wrapper.find('[data-state-dot]');
    expect(dot.exists()).toBe(true);
    expect(dot.classes().join(' ')).toMatch(/muted|offline/);
  });

  describe('compact mode', () => {
    it('connecting: shows "Connecting"', () => {
      const wrapper = mount(StreamStatusBadge, { props: { state: 'connecting', compact: true } });
      expect(wrapper.text()).toContain('Connecting');
    });

    it('live: shows "Live"', () => {
      const wrapper = mount(StreamStatusBadge, { props: { state: 'live', compact: true } });
      expect(wrapper.text()).toContain('Live');
    });

    it('unreachable: shows "Problem"', () => {
      const wrapper = mount(StreamStatusBadge, { props: { state: 'unreachable', compact: true } });
      expect(wrapper.text()).toContain('Problem');
    });

    it('explicit-offline: shows "Offline"', () => {
      const wrapper = mount(StreamStatusBadge, {
        props: { state: 'explicit-offline', compact: true },
      });
      expect(wrapper.text()).toContain('Offline');
    });
  });
});
