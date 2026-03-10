import type { Role } from '@manlycam/types';
import { ROLE_RANK } from '@manlycam/types';

/**
 * Returns true if callerRole can moderate (mute/ban/delete) a user/message with targetRole.
 * Caller must strictly outrank target. Used for all moderation operations in Stories 5-1 through 5-3.
 */
export function canModerateOver(callerRole: Role, targetRole: Role): boolean {
  return ROLE_RANK[callerRole] > ROLE_RANK[targetRole];
}
