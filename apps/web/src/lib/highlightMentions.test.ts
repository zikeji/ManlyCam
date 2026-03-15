import { describe, it, expect } from 'vitest';
import { highlightMentions } from './highlightMentions';
import type { UserPresence } from '@manlycam/types';

const makeViewer = (id: string, displayName: string): UserPresence => ({
  id,
  displayName,
  avatarUrl: null,
  role: 'ViewerCompany',
  isMuted: false,
  userTag: null,
});

const john = makeViewer('user-001', 'John Smith');
const jane = makeViewer('user-002', 'Jane Doe');
const alice = makeViewer('user-003', 'Alice');

// Build a lookup function from a viewer array
function makeLookup(viewers: UserPresence[]) {
  const map = new Map(viewers.map((v) => [v.id, v]));
  return (id: string) => map.get(id);
}

describe('highlightMentions', () => {
  it('returns content unchanged when no <@ID> tokens present', () => {
    const html = '<p>Hello everyone</p>';
    expect(highlightMentions(html, 'current', makeLookup([john]))).toBe(html);
  });

  it('wraps &lt;@ID&gt; with mention-highlight span for current user', () => {
    const html = '<p>Hello &lt;@user-001&gt;</p>';
    const result = highlightMentions(html, 'user-001', makeLookup([john]));
    expect(result).toContain('<span class="mention-highlight">@John Smith</span>');
    expect(result).not.toContain('&lt;@user-001&gt;');
  });

  it('wraps &lt;@ID&gt; with mention span for other users', () => {
    const html = '<p>Hello &lt;@user-001&gt;</p>';
    const result = highlightMentions(html, 'user-002', makeLookup([john]));
    expect(result).toContain('<span class="mention">@John Smith</span>');
    expect(result).not.toContain('&lt;@user-001&gt;');
  });

  it('resolves multiple mentions in one message', () => {
    const html = '<p>&lt;@user-001&gt; and &lt;@user-002&gt;</p>';
    const result = highlightMentions(html, 'user-001', makeLookup([john, jane]));
    expect(result).toContain('<span class="mention-highlight">@John Smith</span>');
    expect(result).toContain('<span class="mention">@Jane Doe</span>');
  });

  it('falls back to @unknown user for unrecognized IDs', () => {
    const html = '<p>&lt;@ghost-999&gt;</p>';
    const result = highlightMentions(html, 'user-001', makeLookup([john]));
    expect(result).toContain('<span class="mention">@unknown user</span>');
    expect(result).not.toContain('&lt;@ghost-999&gt;');
  });

  it('escapes & in display name to prevent double-encoding', () => {
    const ampUser = makeViewer('amp-user', 'Alice & Bob');
    const html = '<p>&lt;@amp-user&gt;</p>';
    const result = highlightMentions(html, 'other', makeLookup([ampUser]));
    expect(result).toContain('&amp;');
    expect(result).toContain('@Alice');
  });

  it('self-mention: displays own displayName in mention-highlight', () => {
    const html = '<p>&lt;@user-003&gt;</p>';
    const result = highlightMentions(html, 'user-003', makeLookup([alice]));
    expect(result).toContain('<span class="mention-highlight">@Alice</span>');
  });

  it('highlights all three viewers with correct classes', () => {
    const html = '<p>&lt;@user-001&gt; &lt;@user-002&gt; &lt;@user-003&gt;</p>';
    const result = highlightMentions(html, 'user-002', makeLookup([john, jane, alice]));
    expect(result).toContain('<span class="mention">@John Smith</span>');
    expect(result).toContain('<span class="mention-highlight">@Jane Doe</span>');
    expect(result).toContain('<span class="mention">@Alice</span>');
  });

  it('does not alter content without &lt;@...&gt; token', () => {
    const html = '<p>@JohnSmith hello</p>';
    expect(highlightMentions(html, 'user-001', makeLookup([john]))).toBe(html);
  });

  it('uses lookup function — resolves IDs unknown to passed viewers if lookup returns them', () => {
    const html = '<p>&lt;@user-001&gt;</p>';
    // Lookup always returns john, regardless of what "viewers" would have
    const alwaysJohn = (_id: string) => john;
    const result = highlightMentions(html, 'other', alwaysJohn);
    expect(result).toContain('<span class="mention">@John Smith</span>');
  });
});
