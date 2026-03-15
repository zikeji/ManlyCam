export const Role = {
  Admin: 'Admin',
  Moderator: 'Moderator',
  ViewerCompany: 'ViewerCompany',
  ViewerGuest: 'ViewerGuest',
  System: 'System',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ROLE_RANK: Record<Role, number> = {
  Admin: 3,
  Moderator: 2,
  ViewerCompany: 1,
  ViewerGuest: 0,
  System: -1,
};

/**
 * Returns true if the user has at least the minimum required role.
 */
export function hasRole(user: { role: Role } | null | undefined, minRole: Role): boolean {
  if (!user) return false;
  return ROLE_RANK[user.role] >= ROLE_RANK[minRole];
}
