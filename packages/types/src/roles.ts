export const Role = {
  Admin: 'Admin',
  Moderator: 'Moderator',
  ViewerCompany: 'ViewerCompany',
  ViewerGuest: 'ViewerGuest',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ROLE_RANK: Record<Role, number> = {
  Admin: 3,
  Moderator: 2,
  ViewerCompany: 1,
  ViewerGuest: 0,
};
