import type { Role } from '@manlycam/types';

export const ROLE_RANK: Record<Role, number> = {
  Admin: 3,
  Moderator: 2,
  ViewerCompany: 1,
  ViewerGuest: 0,
};

/**
 * Returns true if callerRole can moderate (mute/ban/delete) a user/message with targetRole.
 * Caller must strictly outrank target. Used for all moderation operations in Stories 5-1 through 5-3.
 */
export function canModerateOver(callerRole: Role, targetRole: Role): boolean {
  return ROLE_RANK[callerRole] > ROLE_RANK[targetRole];
}
