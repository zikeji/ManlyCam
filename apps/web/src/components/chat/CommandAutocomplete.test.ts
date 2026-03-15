import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import CommandAutocomplete from './CommandAutocomplete.vue';

interface CommandEntry {
  name: string;
  description: string;
  placeholder?: string;
}

const makeCmd = (name: string, description: string, placeholder?: string): CommandEntry => ({
  name,
  description,
  placeholder,
});

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

const defaultCommands: CommandEntry[] = [
  makeCmd('shrug', 'Appends shrug', '[message]'),
  makeCmd('tableflip', 'Appends tableflip', '[message]'),
  makeCmd('secret', 'Admin only'),
];

describe('CommandAutocomplete.vue', () => {
  it('does not render when visible is false', () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: false,
        query: '',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('does not render when no filtered commands match', async () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: 'xyz',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('renders listbox when visible and commands exist', () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: '',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
  });

  it('has role=listbox for accessibility', () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: '',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    expect(wrapper.find('[role="listbox"]').attributes('role')).toBe('listbox');
  });

  it('shows all commands when query is empty', () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: '',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    const buttons = wrapper.findAll('[role="option"]');
    expect(buttons).toHaveLength(defaultCommands.length);
  });

  it('filters commands by query prefix match', () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: 'sh',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    const buttons = wrapper.findAll('[role="option"]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toContain('shrug');
  });

  it('filters case-insensitively', () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: 'SH',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    const buttons = wrapper.findAll('[role="option"]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toContain('shrug');
  });

  it('displays /name placeholder and description for each command', () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: 'shrug',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    const text = wrapper.find('[role="option"]').text();
    expect(text).toContain('/shrug');
    expect(text).toContain('[message]');
    expect(text).toContain('Appends shrug');
  });

  it('displays command without placeholder correctly', () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: 'sec',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    const text = wrapper.find('[role="option"]').text();
    expect(text).toContain('/secret');
    expect(text).toContain('Admin only');
  });

  it('shows all commands with same name (duplicate names)', () => {
    const cmdsWithDupe: CommandEntry[] = [
      makeCmd('shrug', 'Shrug v1', '[message]'),
      makeCmd('shrug', 'Shrug v2'),
    ];
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: 'shrug',
        commands: cmdsWithDupe,
        position: { bottom: 0, left: 0 },
      },
    });
    const buttons = wrapper.findAll('[role="option"]');
    expect(buttons).toHaveLength(2);
  });

  it('emits select when a command button is clicked', async () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: 'shrug',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    await wrapper.find('[role="option"]').trigger('mousedown');
    expect(wrapper.emitted('select')).toBeTruthy();
    const emitted = wrapper.emitted('select')![0][0] as CommandEntry;
    expect(emitted.name).toBe('shrug');
  });

  it('emits close when Escape is pressed via handleKeydown', async () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: '',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    const vm = wrapper.vm as unknown as { handleKeydown: (e: KeyboardEvent) => void };
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    vi.spyOn(event, 'preventDefault');
    vm.handleKeydown(event);
    await nextTick();
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('selects via Enter key', async () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: '',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    const vm = wrapper.vm as unknown as { handleKeydown: (e: KeyboardEvent) => void };
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    vi.spyOn(event, 'preventDefault');
    vm.handleKeydown(event);
    await nextTick();
    expect(wrapper.emitted('select')).toBeTruthy();
  });

  it('selects via Tab key', async () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: '',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    const vm = wrapper.vm as unknown as { handleKeydown: (e: KeyboardEvent) => void };
    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    vm.handleKeydown(event);
    await nextTick();
    expect(wrapper.emitted('select')).toBeTruthy();
  });

  it('first command is selected by default', () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: '',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    const vm = wrapper.vm as unknown as { selectedIndex: number };
    expect(vm.selectedIndex).toBe(0);
  });

  it('resets selection to 0 when query changes', async () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: '',
        commands: defaultCommands,
        position: { bottom: 0, left: 0 },
      },
    });
    const vm = wrapper.vm as unknown as {
      handleKeydown: (e: KeyboardEvent) => void;
      selectedIndex: number;
    };
    // Move selection down
    vm.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await nextTick();
    // Change query
    await wrapper.setProps({ query: 's' });
    expect(vm.selectedIndex).toBe(0);
  });

  it('applies correct position style', () => {
    wrapper = mount(CommandAutocomplete, {
      props: {
        visible: true,
        query: '',
        commands: defaultCommands,
        position: { bottom: 100, left: 50 },
      },
    });
    const style = wrapper.find('[role="listbox"]').attributes('style');
    expect(style).toContain('100px');
    expect(style).toContain('50px');
  });
});
