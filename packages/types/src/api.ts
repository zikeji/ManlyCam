import type { Role } from './roles.js';

export interface MeResponse {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  bannedAt: string | null;
  mutedAt: string | null;
}
