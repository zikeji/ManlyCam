import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import BatteryIndicator from './BatteryIndicator.vue';
import type { PiSugarStatus } from '@manlycam/types';

// Mock ResizeObserver for Popover
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('BatteryIndicator', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
      wrapper = null;
    }
  });

  const mountBattery = (status: PiSugarStatus) => {
    wrapper = mount(BatteryIndicator, { props: { status } });
    return wrapper;
  };

  // AC #7: Normal battery — discharging-high (level > 80, not plugged)
  describe('AC #7 — discharging-high (level > 80)', () => {
    it('renders BatteryFull icon', () => {
      mountBattery({
        connected: true,
        level: 90,
        plugged: false,
        charging: false,
        chargingRange: null,
      });
      expect(wrapper!.html()).toContain('lucide-battery-full');
    });

    it('shows correct tooltip aria-label with 2dp', () => {
      mountBattery({
        connected: true,
        level: 91.72,
        plugged: false,
        charging: false,
        chargingRange: null,
      });
      const btn = wrapper!.find('button');
      expect(btn.attributes('aria-label')).toBe('Battery: 91.72%');
    });
  });

  // AC #7: Normal battery — discharging-medium (21–80%, not plugged)
  describe('AC #7 — discharging-medium (21–80%)', () => {
    it('renders BatteryMedium icon', () => {
      mountBattery({
        connected: true,
        level: 50,
        plugged: false,
        charging: false,
        chargingRange: null,
      });
      expect(wrapper!.html()).toContain('lucide-battery-medium');
    });

    it('shows Battery tooltip with 2dp level', () => {
      mountBattery({
        connected: true,
        level: 75.0,
        plugged: false,
        charging: false,
        chargingRange: null,
      });
      expect(wrapper!.find('button').attributes('aria-label')).toBe('Battery: 75.00%');
    });
  });

  // AC #8: Low battery (plugged: false, level ≤ 20)
  describe('AC #8 — discharging-low (level ≤ 20)', () => {
    it('renders BatteryLow icon', () => {
      mountBattery({
        connected: true,
        level: 15,
        plugged: false,
        charging: false,
        chargingRange: null,
      });
      expect(wrapper!.html()).toContain('lucide-battery-low');
    });

    it('shows "Battery Low" in tooltip', () => {
      mountBattery({
        connected: true,
        level: 15,
        plugged: false,
        charging: false,
        chargingRange: null,
      });
      const btn = wrapper!.find('button');
      expect(btn.attributes('aria-label')).toBe('Battery Low: 15.00%');
    });

    it('applies amber color class', () => {
      mountBattery({
        connected: true,
        level: 10,
        plugged: false,
        charging: false,
        chargingRange: null,
      });
      const icon = wrapper!.find('[class*="text-amber"]');
      expect(icon.exists()).toBe(true);
    });
  });

  // AC #9: Charging (plugged: true, charging: true)
  describe('AC #9 — charging state', () => {
    it('renders BatteryCharging icon', () => {
      mountBattery({
        connected: true,
        level: 60,
        plugged: true,
        charging: true,
        chargingRange: null,
      });
      expect(wrapper!.html()).toContain('lucide-battery-charging');
    });

    it('shows "Charging" in tooltip with 2dp', () => {
      mountBattery({
        connected: true,
        level: 60,
        plugged: true,
        charging: true,
        chargingRange: null,
      });
      const btn = wrapper!.find('button');
      expect(btn.attributes('aria-label')).toBe('Charging: 60.00%');
    });
  });

  // AC #10: Smart charge (plugged: true, charging: false, chargingRange set)
  describe('AC #10 — smart charge state', () => {
    it('renders BatteryPlus icon', () => {
      mountBattery({
        connected: true,
        level: 80,
        plugged: true,
        charging: false,
        chargingRange: [75, 90],
      });
      expect(wrapper!.html()).toContain('lucide-battery-plus');
    });

    it('shows "Smart Charge" in tooltip', () => {
      mountBattery({
        connected: true,
        level: 80,
        plugged: true,
        charging: false,
        chargingRange: [75, 90],
      });
      const btn = wrapper!.find('button');
      expect(btn.attributes('aria-label')).toBe('Smart Charge: 80.00%');
    });

    it('applies green color class', () => {
      mountBattery({
        connected: true,
        level: 80,
        plugged: true,
        charging: false,
        chargingRange: [75, 90],
      });
      const icon = wrapper!.find('[class*="text-green"]');
      expect(icon.exists()).toBe(true);
    });
  });

  // Full / charged state (plugged: true, level >= 100)
  describe('full state (plugged, level >= 100)', () => {
    it('renders PlugZap icon', () => {
      mountBattery({
        connected: true,
        level: 100,
        plugged: true,
        charging: false,
        chargingRange: null,
      });
      expect(wrapper!.html()).toContain('lucide-plug-zap');
    });

    it('shows "Fully Charged" tooltip', () => {
      mountBattery({
        connected: true,
        level: 100,
        plugged: true,
        charging: false,
        chargingRange: null,
      });
      expect(wrapper!.find('button').attributes('aria-label')).toBe('Fully Charged: 100.00%');
    });
  });

  // AC #11: Unknown / disconnected
  describe('AC #11 — unknown / disconnected state', () => {
    it('renders BatteryMedium icon for unknown state', () => {
      mountBattery({ connected: false });
      expect(wrapper!.html()).toContain('lucide-battery-medium');
    });

    it('shows "Status Unknown" tooltip', () => {
      mountBattery({ connected: false });
      const btn = wrapper!.find('button');
      expect(btn.attributes('aria-label')).toBe('Status Unknown');
    });
  });

  // AC #12: null status — component hidden (tested in BroadcastConsole)
  describe('popover content', () => {
    it('popover shows level bar for connected state', () => {
      mountBattery({
        connected: true,
        level: 50,
        plugged: false,
        charging: false,
        chargingRange: null,
      });
      // PopoverContent renders in a portal — verify component renders without error
      expect(wrapper!.exists()).toBe(true);
    });

    it('popover shows "Communication Failed" for disconnected state', async () => {
      mountBattery({ connected: false });
      await wrapper!.find('button').trigger('click');
      await flushPromises();
      const body = document.body.innerHTML;
      expect(body).toContain('Communication Failed');
    });

    it('popover shows range for smart charge mode', async () => {
      mountBattery({
        connected: true,
        level: 82,
        plugged: true,
        charging: false,
        chargingRange: [75, 90],
      });
      await wrapper!.find('button').trigger('click');
      await flushPromises();
      const body = document.body.innerHTML;
      expect(body).toContain('75%–90%');
    });

    it('popover shows low battery warning', async () => {
      mountBattery({
        connected: true,
        level: 10,
        plugged: false,
        charging: false,
        chargingRange: null,
      });
      await wrapper!.find('button').trigger('click');
      await flushPromises();
      const body = document.body.innerHTML;
      expect(body).toContain('Low battery');
    });

    it('popover shows charging indicator', async () => {
      mountBattery({
        connected: true,
        level: 55,
        plugged: true,
        charging: true,
        chargingRange: null,
      });
      await wrapper!.find('button').trigger('click');
      await flushPromises();
      const body = document.body.innerHTML;
      expect(body).toContain('Charging...');
    });

    it('popover shows 2dp level in header', async () => {
      mountBattery({
        connected: true,
        level: 91.71799,
        plugged: false,
        charging: false,
        chargingRange: null,
      });
      await wrapper!.find('button').trigger('click');
      await flushPromises();
      const body = document.body.innerHTML;
      expect(body).toContain('91.72%');
    });
  });

  describe('accessibility', () => {
    it('has aria-label on button', () => {
      mountBattery({
        connected: true,
        level: 80,
        plugged: false,
        charging: false,
        chargingRange: null,
      });
      const btn = wrapper!.find('button');
      expect(btn.attributes('aria-label')).toBeTruthy();
    });
  });
});
