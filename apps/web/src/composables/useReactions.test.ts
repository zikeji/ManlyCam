import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatMessage, Reaction } from '@manlycam/types';

// Mock apiFetch for useReactions factory
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  ApiFetchError: class extends Error {},
}));

// We need to mock useChat's messages ref
vi.mock('./useChat', async () => {
  const { ref } = await import('vue');
  const messages = ref<ChatMessage[]>([]);
  return { messages };
});

import { messages } from './useChat';
import { handleReactionAdd, handleReactionRemove, useReactions } from './useReactions';
import { apiFetch } from '@/lib/api';

function makeMessage(id: string, reactions: Reaction[] = []): ChatMessage {
  return {
    id,
    userId: 'user-001',
    displayName: 'User',
    avatarUrl: null,
    authorRole: 'ViewerCompany',
    content: 'Hello',
    editHistory: null,
    updatedAt: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date().toISOString(),
    userTag: null,
    reactions,
  };
}

describe('handleReactionAdd', () => {
  beforeEach(() => {
    messages.value = [];
    vi.clearAllMocks();
  });

  it('adds a new reaction to a message', () => {
    messages.value = [makeMessage('msg-001')];
    const payload = {
      messageId: 'msg-001',
      userId: 'user-002',
      displayName: 'User Two',
      role: 'ViewerGuest' as const,
      emoji: 'thumbs_up',
      createdAt: new Date().toISOString(),
    };

    handleReactionAdd(payload);

    expect(messages.value[0].reactions).toHaveLength(1);
    expect(messages.value[0].reactions![0].emoji).toBe('thumbs_up');
    expect(messages.value[0].reactions![0].count).toBe(1);
    expect(messages.value[0].reactions![0].userIds).toEqual(['user-002']);
    expect(messages.value[0].reactions![0].userDisplayNames).toEqual(['User Two']);
    expect(messages.value[0].reactions![0].userRoles).toEqual(['ViewerGuest']);
  });

  it('increments count when emoji already exists on message', () => {
    const existing: Reaction = {
      emoji: 'thumbs_up',
      count: 1,
      userReacted: false,
      userIds: ['user-existing'],
      userDisplayNames: ['Existing User'],
      userRoles: ['ViewerCompany'],
      firstReactedAt: new Date().toISOString(),
    };
    messages.value = [makeMessage('msg-001', [existing])];

    handleReactionAdd({
      messageId: 'msg-001',
      userId: 'user-new',
      displayName: 'New User',
      role: 'ViewerGuest' as const,
      emoji: 'thumbs_up',
      createdAt: new Date().toISOString(),
    });

    expect(messages.value[0].reactions![0].count).toBe(2);
    expect(messages.value[0].reactions![0].userIds).toContain('user-new');
    expect(messages.value[0].reactions![0].userIds).toContain('user-existing');
    expect(messages.value[0].reactions![0].userDisplayNames).toContain('New User');
    expect(messages.value[0].reactions![0].userDisplayNames).toContain('Existing User');
    expect(messages.value[0].reactions![0].userRoles).toContain('ViewerGuest');
    expect(messages.value[0].reactions![0].userRoles).toContain('ViewerCompany');
  });

  it('handles existing reaction without userDisplayNames (legacy data fallback)', () => {
    const existing = {
      emoji: 'thumbs_up',
      count: 1,
      userReacted: false,
      userIds: ['user-existing'],
      userDisplayNames: undefined,
      userRoles: undefined,
      firstReactedAt: new Date().toISOString(),
    } as unknown as Reaction;
    messages.value = [makeMessage('msg-001', [existing])];

    handleReactionAdd({
      messageId: 'msg-001',
      userId: 'user-new',
      displayName: 'New User',
      role: 'ViewerGuest' as const,
      emoji: 'thumbs_up',
      createdAt: new Date().toISOString(),
    });

    // Should not throw; userDisplayNames should be populated
    expect(messages.value[0].reactions![0].userDisplayNames).toContain('New User');
  });

  it('handles message with no reactions array (undefined reactions)', () => {
    const msg = makeMessage('msg-001');
    msg.reactions = undefined;
    messages.value = [msg];

    handleReactionAdd({
      messageId: 'msg-001',
      userId: 'user-002',
      displayName: 'User Two',
      role: 'ViewerGuest' as const,
      emoji: 'thumbs_up',
      createdAt: new Date().toISOString(),
    });

    expect(messages.value[0].reactions).toHaveLength(1);
    expect(messages.value[0].reactions![0].userDisplayNames).toEqual(['User Two']);
  });

  it('does not add duplicate userId for same reaction', () => {
    const existing: Reaction = {
      emoji: 'thumbs_up',
      count: 1,
      userReacted: false,
      userIds: ['user-002'],
      userDisplayNames: ['User Two'],
      userRoles: ['ViewerGuest' as const],
      firstReactedAt: new Date().toISOString(),
    };
    messages.value = [makeMessage('msg-001', [existing])];

    handleReactionAdd({
      messageId: 'msg-001',
      userId: 'user-002',
      displayName: 'User Two',
      role: 'ViewerGuest' as const,
      emoji: 'thumbs_up',
      createdAt: new Date().toISOString(),
    });

    // Should not increment since user-002 is already in userIds
    expect(messages.value[0].reactions![0].count).toBe(1);
    expect(messages.value[0].reactions![0].userIds).toHaveLength(1);
  });

  it('sets userReacted=true when currentUserId matches payload userId', () => {
    messages.value = [makeMessage('msg-001')];

    handleReactionAdd(
      {
        messageId: 'msg-001',
        userId: 'current-user',
        displayName: 'Me',
        role: 'ViewerGuest' as const,
        emoji: 'red_heart',
        createdAt: new Date().toISOString(),
      },
      'current-user',
    );

    expect(messages.value[0].reactions![0].userReacted).toBe(true);
  });

  it('sets userReacted=false when currentUserId does not match payload userId', () => {
    messages.value = [makeMessage('msg-001')];

    handleReactionAdd(
      {
        messageId: 'msg-001',
        userId: 'other-user',
        displayName: 'Other',
        role: 'ViewerGuest' as const,
        emoji: 'red_heart',
        createdAt: new Date().toISOString(),
      },
      'current-user',
    );

    expect(messages.value[0].reactions![0].userReacted).toBe(false);
  });

  it('does nothing for unknown messageId', () => {
    messages.value = [makeMessage('msg-001')];

    handleReactionAdd({
      messageId: 'msg-UNKNOWN',
      userId: 'user-002',
      displayName: 'User',
      role: 'ViewerGuest' as const,
      emoji: 'thumbs_up',
      createdAt: new Date().toISOString(),
    });

    expect(messages.value[0].reactions).toHaveLength(0);
  });
});

describe('handleReactionRemove', () => {
  beforeEach(() => {
    messages.value = [];
    vi.clearAllMocks();
  });

  it('decrements count and removes userId', () => {
    const existing: Reaction = {
      emoji: 'thumbs_up',
      count: 2,
      userReacted: false,
      userIds: ['user-001', 'user-002'],
      userDisplayNames: ['User One', 'User Two'],
      userRoles: ['ViewerGuest', 'ViewerCompany'],
      firstReactedAt: new Date().toISOString(),
    };
    messages.value = [makeMessage('msg-001', [existing])];

    handleReactionRemove({ messageId: 'msg-001', userId: 'user-001', emoji: 'thumbs_up' });

    expect(messages.value[0].reactions![0].count).toBe(1);
    expect(messages.value[0].reactions![0].userIds).not.toContain('user-001');
    expect(messages.value[0].reactions![0].userIds).toContain('user-002');
    expect(messages.value[0].reactions![0].userDisplayNames).not.toContain('User One');
    expect(messages.value[0].reactions![0].userDisplayNames).toContain('User Two');
    expect(messages.value[0].reactions![0].userRoles).not.toContain('ViewerGuest');
    expect(messages.value[0].reactions![0].userRoles).toContain('ViewerCompany');
  });

  it('removes reaction entirely when count reaches 0', () => {
    const existing: Reaction = {
      emoji: 'thumbs_up',
      count: 1,
      userReacted: true,
      userIds: ['user-001'],
      userDisplayNames: ['User One'],
      userRoles: ['ViewerGuest' as const],
      firstReactedAt: new Date().toISOString(),
    };
    messages.value = [makeMessage('msg-001', [existing])];

    handleReactionRemove({ messageId: 'msg-001', userId: 'user-001', emoji: 'thumbs_up' });

    expect(messages.value[0].reactions).toHaveLength(0);
  });

  it('updates userReacted when current user removes their reaction', () => {
    const existing: Reaction = {
      emoji: 'thumbs_up',
      count: 2,
      userReacted: true,
      userIds: ['current-user', 'other-user'],
      userDisplayNames: ['Current User', 'Other User'],
      userRoles: ['ViewerGuest', 'ViewerCompany'],
      firstReactedAt: new Date().toISOString(),
    };
    messages.value = [makeMessage('msg-001', [existing])];

    handleReactionRemove(
      { messageId: 'msg-001', userId: 'current-user', emoji: 'thumbs_up' },
      'current-user',
    );

    expect(messages.value[0].reactions![0].userReacted).toBe(false);
  });

  it('handles existing reaction without userDisplayNames when removing (legacy data fallback)', () => {
    const existing = {
      emoji: 'thumbs_up',
      count: 2,
      userReacted: false,
      userIds: ['user-001', 'user-002'],
      userDisplayNames: undefined,
      userRoles: undefined,
      firstReactedAt: new Date().toISOString(),
    } as unknown as Reaction;
    messages.value = [makeMessage('msg-001', [existing])];

    // Should not throw
    handleReactionRemove({ messageId: 'msg-001', userId: 'user-001', emoji: 'thumbs_up' });

    expect(messages.value[0].reactions![0].count).toBe(1);
  });

  it('handles message with no reactions array when removing', () => {
    const msg = makeMessage('msg-001');
    msg.reactions = undefined;
    messages.value = [msg];

    // Should not throw; the handler uses `[]` fallback so reactions becomes `[]` after the update
    handleReactionRemove({ messageId: 'msg-001', userId: 'user-001', emoji: 'thumbs_up' });

    expect(messages.value[0].reactions).toEqual([]);
  });

  it('does nothing for unknown messageId', () => {
    const existing: Reaction = {
      emoji: 'thumbs_up',
      count: 1,
      userReacted: false,
      userIds: ['user-001'],
      userDisplayNames: ['User One'],
      userRoles: ['ViewerGuest' as const],
      firstReactedAt: new Date().toISOString(),
    };
    messages.value = [makeMessage('msg-001', [existing])];

    handleReactionRemove({ messageId: 'msg-UNKNOWN', userId: 'user-001', emoji: 'thumbs_up' });

    expect(messages.value[0].reactions![0].count).toBe(1);
  });
});

describe('useReactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('addReaction calls apiFetch with POST', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    const { addReaction } = useReactions();
    await addReaction('msg-001', 'thumbs_up');
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/messages/msg-001/reactions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('removeReaction calls apiFetch with DELETE', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    const { removeReaction } = useReactions();
    await removeReaction('msg-001', 'thumbs_up');
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/messages/msg-001/reactions/thumbs_up',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('modRemoveReaction calls apiFetch with DELETE to mod endpoint', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    const { modRemoveReaction } = useReactions();
    await modRemoveReaction('msg-001', 'thumbs_up', 'target-user');
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/messages/msg-001/reactions/thumbs_up/users/target-user',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
