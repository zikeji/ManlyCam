<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { X } from 'lucide-vue-next';
import UserList from './UserList.vue';
import AllowlistPanel from './AllowlistPanel.vue';

const isOpen = defineModel<boolean>('open', { default: false });
</script>

<template>
  <AlertDialog v-model:open="isOpen">
    <AlertDialogContent class="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
      <AlertDialogHeader class="px-6 py-4 border-b border-border flex flex-row items-center justify-between space-y-0">
        <AlertDialogTitle>Admin</AlertDialogTitle>
        <AlertDialogCancel class="mt-0 p-1 h-auto bg-transparent border-none hover:bg-accent">
          <X class="w-4 h-4" />
        </AlertDialogCancel>
      </AlertDialogHeader>
      <Tabs default-value="users" class="flex-1 flex flex-col overflow-hidden">
        <TabsList class="px-6 pt-2 shrink-0 justify-start bg-transparent border-b border-border rounded-none h-auto pb-0 gap-0">
          <TabsTrigger value="users" class="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2">
            Users
          </TabsTrigger>
          <TabsTrigger value="allowlist" class="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2">
            Allowlist
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users" class="flex-1 overflow-hidden m-0 data-[state=inactive]:hidden">
          <UserList />
        </TabsContent>
        <TabsContent value="allowlist" force-mount class="flex-1 overflow-hidden m-0 data-[state=inactive]:hidden">
          <AllowlistPanel />
        </TabsContent>
      </Tabs>
    </AlertDialogContent>
  </AlertDialog>
</template>
