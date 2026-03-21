<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { X } from 'lucide-vue-next';
import UserList from './UserList.vue';

const isOpen = defineModel<boolean>('open', { default: false });
</script>

<template>
  <AlertDialog v-model:open="isOpen">
    <AlertDialogContent class="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
      <AlertDialogHeader class="px-6 py-4 border-b border-border flex flex-row items-center justify-between space-y-0">
        <AlertDialogTitle>User Management</AlertDialogTitle>
        <AlertDialogCancel class="mt-0 p-1 h-auto bg-transparent border-none hover:bg-accent">
          <X class="w-4 h-4" />
        </AlertDialogCancel>
      </AlertDialogHeader>
      <div class="flex-1 min-h-0">
        <UserList />
      </div>
    </AlertDialogContent>
  </AlertDialog>
</template>
