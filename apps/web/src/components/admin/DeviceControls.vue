<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Terminal, Power } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'vue-sonner';
import { apiFetch } from '@/lib/api';
import { useDeviceShutdown } from '@/composables/useDeviceShutdown';
import { openTerminal } from '@/composables/useTerminalWindow';

const agentEnabled = ref(false);
const shutdownDialogOpen = ref(false);
const { shutdownDevice, isShuttingDown, error } = useDeviceShutdown();

onMounted(async () => {
  try {
    const data = await apiFetch<{ agentEnabled: boolean }>('/api/admin/device/status');
    agentEnabled.value = data.agentEnabled;
  } catch (err) {
    console.error('[DeviceControls] Failed to fetch agent status:', err);
  }
});

const handleShutdown = async (): Promise<void> => {
  shutdownDialogOpen.value = false;
  const ok = await shutdownDevice();
  if (ok) {
    toast.success('Shutdown command sent — device is powering off');
  } else {
    toast.error(error.value ?? 'Failed to shutdown device');
  }
};
</script>

<template>
  <div v-if="agentEnabled" class="space-y-2" data-testid="device-controls-root">
    <p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Device</p>
    <div class="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        size="sm"
        data-testid="remote-terminal-btn"
        @click="openTerminal"
      >
        <Terminal class="w-4 h-4" />
        Terminal
      </Button>
      <Button
        variant="destructive"
        size="sm"
        class="min-w-0"
        :disabled="isShuttingDown"
        data-testid="shutdown-btn"
        @click="shutdownDialogOpen = true"
      >
        <Power class="w-4 h-4" />
        {{ isShuttingDown ? 'Shutting down…' : 'Shutdown' }}
      </Button>
    </div>
    <p v-if="error" class="text-xs text-destructive" data-testid="shutdown-error">{{ error }}</p>
  </div>

  <AlertDialog :open="shutdownDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Shutdown device</AlertDialogTitle>
        <AlertDialogDescription>
          This will gracefully power off the Pi. The stream and terminal will go offline until the
          device is powered back on. Continue?
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="shutdownDialogOpen = false">Cancel</AlertDialogCancel>
        <AlertDialogAction
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          data-testid="shutdown-confirm-btn"
          @click="handleShutdown"
        >
          Shutdown
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
