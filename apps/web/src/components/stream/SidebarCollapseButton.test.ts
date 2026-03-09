import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import SidebarCollapseButton from './SidebarCollapseButton.vue';

vi.mock('@/components/ui/button', () => ({
  Button: defineComponent({
    template: '<button v-bind="$attrs"><slot/></button>',
  }),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: defineComponent({
    template: '<span v-bind="$attrs"><slot/></span>',
  }),
}));

vi.mock('lucide-vue-next', () => ({
  ChevronRight: defineComponent({
    name: 'ChevronRight',
    template: '<svg data-icon="chevron-right" />',
  }),
  ChevronLeft: defineComponent({
    name: 'ChevronLeft',
    template: '<svg data-icon="chevron-left" />',
  }),
}));

let wrapper: ReturnType<typeof mount> | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('SidebarCollapseButton', () => {
  it('renders ChevronRight when isOpen=true', () => {
    wrapper = mount(SidebarCollapseButton, { props: { isOpen: true, unreadCount: 0 } });
    expect(wrapper.find('[data-icon="chevron-right"]').exists()).toBe(true);
    expect(wrapper.find('[data-icon="chevron-left"]').exists()).toBe(false);
  });

  it('renders ChevronLeft when isOpen=false', () => {
    wrapper = mount(SidebarCollapseButton, { props: { isOpen: false, unreadCount: 0 } });
    expect(wrapper.find('[data-icon="chevron-left"]').exists()).toBe(true);
    expect(wrapper.find('[data-icon="chevron-right"]').exists()).toBe(false);
  });

  it('badge NOT rendered when isOpen=true even if unreadCount > 0', () => {
    wrapper = mount(SidebarCollapseButton, { props: { isOpen: true, unreadCount: 5 } });
    expect(wrapper.find('span').exists()).toBe(false);
  });

  it('badge NOT rendered when isOpen=false and unreadCount === 0', () => {
    wrapper = mount(SidebarCollapseButton, { props: { isOpen: false, unreadCount: 0 } });
    expect(wrapper.find('span').exists()).toBe(false);
  });

  it('badge IS rendered when isOpen=false and unreadCount > 0; shows count', () => {
    wrapper = mount(SidebarCollapseButton, { props: { isOpen: false, unreadCount: 3 } });
    const badge = wrapper.find('span');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe('3');
  });

  it('badge shows 99+ when unreadCount > 99', () => {
    wrapper = mount(SidebarCollapseButton, { props: { isOpen: false, unreadCount: 150 } });
    expect(wrapper.find('span').text()).toBe('99+');
  });

  it('aria-label="Collapse chat sidebar" when isOpen=true', () => {
    wrapper = mount(SidebarCollapseButton, { props: { isOpen: true, unreadCount: 0 } });
    expect(wrapper.find('button').attributes('aria-label')).toBe('Collapse chat sidebar');
  });

  it('aria-label="Expand chat sidebar" when isOpen=false and unreadCount=0', () => {
    wrapper = mount(SidebarCollapseButton, { props: { isOpen: false, unreadCount: 0 } });
    expect(wrapper.find('button').attributes('aria-label')).toBe('Expand chat sidebar');
  });

  it('aria-label="Expand chat sidebar (3 unread)" when isOpen=false and unreadCount=3', () => {
    wrapper = mount(SidebarCollapseButton, { props: { isOpen: false, unreadCount: 3 } });
    expect(wrapper.find('button').attributes('aria-label')).toBe('Expand chat sidebar (3 unread)');
  });

  it('emits toggle on button click', async () => {
    wrapper = mount(SidebarCollapseButton, { props: { isOpen: true, unreadCount: 0 } });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('toggle')).toBeTruthy();
    expect(wrapper.emitted('toggle')).toHaveLength(1);
  });
});
