<script setup lang="ts">
import { useAdminUsers } from '@/composables/useAdminUsers';
import { useAuth } from '@/composables/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-vue-next';
import { Role } from '@manlycam/types';

const { users, isLoading, error, updateRole } = useAdminUsers();
const { user: currentUser } = useAuth();

const getRoleBadgeVariant = (role: Role) => {
  switch (role) {
    case Role.Admin: return 'destructive';
    case Role.Moderator: return 'default';
    case Role.ViewerCompany: return 'outline';
    case Role.ViewerGuest: return 'secondary';
    default: return 'secondary';
  }
};

const getRoleBadgeClass = (role: Role) => {
  switch (role) {
    case Role.Admin: return 'bg-red-900/50 text-red-200 border-red-700 hover:bg-red-900/50';
    case Role.Moderator: return 'bg-blue-900/50 text-blue-200 border-blue-700 hover:bg-blue-900/50';
    case Role.ViewerCompany: return 'bg-orange-900/50 text-orange-200 border-orange-700 hover:bg-orange-900/50';
    case Role.ViewerGuest: return 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-800';
    default: return '';
  }
};

const canChangeRole = (user: any) => {
  return user.id !== currentUser.value?.id && user.role !== Role.Admin;
};

const ROLES_OPTIONS = [Role.Moderator, Role.ViewerCompany, Role.ViewerGuest];

async function handleRoleChange(user: any, newRole: string) {
  if (user.role === newRole) return;
  try {
    await updateRole(user.id, newRole as Role);
  } catch (err) {
    // Error handled in updateRole
  }
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <div v-if="isLoading && users.length === 0" class="flex-1 flex items-center justify-center">
      <span class="text-sm text-muted-foreground animate-pulse">Loading users...</span>
    </div>
    <div v-else-if="error" class="flex-1 flex items-center justify-center p-4 text-center">
      <span class="text-sm text-destructive">{{ error }}</span>
    </div>
    <ScrollArea v-else class="flex-1">
      <div class="min-w-full inline-block align-middle">
        <table class="min-w-full border-collapse">
          <thead>
            <tr class="border-b border-border text-left">
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">User</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-b border-border/50 hover:bg-accent/50 transition-colors">
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span class="text-sm font-medium text-foreground">{{ user.displayName }}</span>
                  <span class="text-xs text-muted-foreground">{{ user.email }}</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <Badge :variant="getRoleBadgeVariant(user.role)" :class="getRoleBadgeClass(user.role)">
                  {{ user.role }}
                </Badge>
              </td>
              <td class="px-4 py-3 text-right">
                <DropdownMenu v-if="canChangeRole(user)">
                  <DropdownMenuTrigger as-child>
                    <Button variant="outline" size="sm" class="h-7 px-2 text-[10px] gap-1">
                      Change Role
                      <ChevronDown class="w-3 h-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuRadioGroup
                      :model-value="user.role"
                      @update:model-value="(val) => handleRoleChange(user, val as string)"
                    >
                      <DropdownMenuRadioItem
                        v-for="role in ROLES_OPTIONS"
                        :key="role"
                        :value="role"
                        class="text-xs"
                      >
                        {{ role }}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <span v-else-if="user.id === currentUser?.id" class="text-[10px] text-muted-foreground italic">You</span>
                <span v-else-if="user.role === Role.Admin" class="text-[10px] text-muted-foreground italic">System Admin</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </ScrollArea>
  </div>
</template>
