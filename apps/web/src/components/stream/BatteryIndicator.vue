<script setup lang="ts">
import { computed } from 'vue';
import {
  BatteryLow,
  BatteryMedium,
  BatteryFull,
  BatteryCharging,
  BatteryPlus,
  PlugZap,
} from 'lucide-vue-next';
import type { PiSugarStatus } from '@manlycam/types';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const props = defineProps<{
  status: PiSugarStatus;
}>();

type BatteryState =
  | 'full'
  | 'charging'
  | 'smart-charge'
  | 'discharging-high'
  | 'discharging-medium'
  | 'discharging-low'
  | 'unknown';

const batteryState = computed((): BatteryState => {
  if (!props.status.connected) return 'unknown';
  const { level, plugged, charging, chargingRange } = props.status;
  if (plugged && level >= 100) return 'full';
  if (plugged && charging) return 'charging';
  if (plugged && !charging && chargingRange !== null) return 'smart-charge';
  if (level <= 20) return 'discharging-low';
  if (level <= 80) return 'discharging-medium';
  return 'discharging-high';
});

const levelDisplay = computed((): string => {
  if (!props.status.connected) return '';
  return props.status.level.toFixed(2);
});

const tooltipText = computed((): string => {
  if (!props.status.connected) return 'Status Unknown';
  const pct = `${levelDisplay.value}%`;
  if (batteryState.value === 'full') return `Fully Charged: ${pct}`;
  if (batteryState.value === 'charging') return `Charging: ${pct}`;
  if (batteryState.value === 'smart-charge') return `Smart Charge: ${pct}`;
  if (batteryState.value === 'discharging-low') return `Battery Low: ${pct}`;
  return `Battery: ${pct}`;
});

const iconClass = computed((): string => {
  if (batteryState.value === 'discharging-low') return 'w-5 h-5 text-amber-500';
  if (batteryState.value === 'smart-charge') return 'w-5 h-5 text-green-500';
  if (batteryState.value === 'charging' || batteryState.value === 'full') return 'w-5 h-5 text-green-500';
  if (batteryState.value === 'unknown') return 'w-5 h-5 text-muted-foreground';
  return 'w-5 h-5';
});
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <Popover>
        <TooltipTrigger as-child>
          <PopoverTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="w-11 h-11 rounded"
              :aria-label="tooltipText"
            >
              <PlugZap v-if="batteryState === 'full'" :class="iconClass" />
              <BatteryCharging v-else-if="batteryState === 'charging'" :class="iconClass" />
              <BatteryPlus v-else-if="batteryState === 'smart-charge'" :class="iconClass" />
              <BatteryLow v-else-if="batteryState === 'discharging-low'" :class="iconClass" />
              <BatteryFull v-else-if="batteryState === 'discharging-high'" :class="iconClass" />
              <BatteryMedium v-else :class="iconClass" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ tooltipText }}</p>
        </TooltipContent>

        <PopoverContent class="w-56 p-3" side="top" align="start">
          <!-- Unknown / disconnected state -->
          <template v-if="!status.connected">
            <p class="text-sm font-medium text-muted-foreground">Communication Failed</p>
            <p class="text-xs text-muted-foreground mt-1">Status Unknown</p>
          </template>

          <!-- Connected states -->
          <template v-else>
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium">Battery</span>
              <span class="text-sm font-semibold">{{ levelDisplay }}%</span>
            </div>

            <!-- Level bar -->
            <div class="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
              <div
                class="h-full rounded-full transition-all"
                :class="
                  batteryState === 'discharging-low'
                    ? 'bg-amber-500'
                    : batteryState === 'smart-charge' || batteryState === 'charging' || batteryState === 'full'
                      ? 'bg-green-500'
                      : 'bg-foreground'
                "
                :style="{ width: `${Math.min(status.level, 100)}%` }"
              />
            </div>

            <!-- State-specific notes -->
            <p v-if="batteryState === 'full'" class="text-xs text-green-500">
              Fully charged
            </p>
            <p v-else-if="batteryState === 'charging'" class="text-xs text-green-500">
              Charging...
            </p>
            <template v-else-if="batteryState === 'smart-charge' && status.chargingRange">
              <p class="text-xs text-muted-foreground">Intentional discharge mode</p>
              <p class="text-xs text-green-500 mt-0.5">
                Range: {{ status.chargingRange[0] }}%–{{ status.chargingRange[1] }}%
              </p>
            </template>
            <p v-else-if="batteryState === 'discharging-low'" class="text-xs text-amber-500">
              Low battery — please charge soon
            </p>
          </template>
        </PopoverContent>
      </Popover>
    </Tooltip>
  </TooltipProvider>
</template>
