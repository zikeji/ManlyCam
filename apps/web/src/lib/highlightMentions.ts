import type { UserPresence } from '@manlycam/types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Resolves <@ID> tokens in already-rendered HTML into styled mention spans.
 * markdown-it escapes < and > as &lt; and &gt;, so the pattern to match is &lt;@ID&gt;.
 * Unknown IDs fall back to "@unknown user".
 *
 * @param lookupUser - Function to resolve a user ID to UserPresence. Accessing a reactive
 *   source (e.g. userCache) inside this function makes the calling computed reactive.
 */
export function highlightMentions(
  renderedHtml: string,
  currentUserId: string,
  lookupUser: (id: string) => UserPresence | undefined,
): string {
  return renderedHtml.replace(/&lt;@([^&]+)&gt;/g, (_match, id) => {
    const viewer = lookupUser(id);
    if (!viewer) {
      return '<span class="mention">@unknown user</span>';
    }
    const safeDisplayName = escapeHtml(viewer.displayName);
    if (id === currentUserId) {
      return `<span class="mention-highlight">@${safeDisplayName}</span>`;
    }
    return `<span class="mention">@${safeDisplayName}</span>`;
  });
}
