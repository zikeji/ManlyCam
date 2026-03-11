import type { UserTag } from '@manlycam/types';

export const DEFAULT_TAG_COLOR = '#6b7280';
export const DEFAULT_GUEST_TAG_COLOR = '#a16207';

export function computeUserTag(user: {
  role: string;
  userTagText: string | null;
  userTagColor: string | null;
}): UserTag | null {
  if (user.userTagText)
    return { text: user.userTagText, color: user.userTagColor ?? DEFAULT_TAG_COLOR };
  if (user.role === 'ViewerGuest') return { text: 'Guest', color: DEFAULT_GUEST_TAG_COLOR };
  return null;
}
