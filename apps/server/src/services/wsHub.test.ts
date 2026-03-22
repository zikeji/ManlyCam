import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WsHub } from './wsHub.js';
import type { UserPresence } from '@manlycam/types';

function makeClient() {
  return { send: vi.fn(), close: vi.fn() };
}

const baseUser: UserPresence = {
  id: 'user-001',
  displayName: 'Alice',
  avatarUrl: null,
  role: 'ViewerCompany',
  isMuted: false,
  userTag: null,
};

const userB: UserPresence = {
  id: 'user-002',
  displayName: 'Bob',
  avatarUrl: 'https://example.com/bob.jpg',
  role: 'Admin',
  isMuted: false,
  userTag: { text: 'Staff', color: '#ff0000' },
};

describe('WsHub', () => {
  let hub: WsHub;

  beforeEach(() => {
    hub = new WsHub();
  });

  describe('addClient', () => {
    it('returns a dispose function', () => {
      const client = makeClient();
      const dispose = hub.addClient('conn-1', client, baseUser);
      expect(typeof dispose).toBe('function');
    });

    it('stored connection appears in getPresenceList()', () => {
      hub.addClient('conn-1', makeClient(), baseUser);
      const list = hub.getPresenceList();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('user-001');
      expect(list[0].displayName).toBe('Alice');
    });

    it('dispose removes connection from getPresenceList()', () => {
      const dispose = hub.addClient('conn-1', makeClient(), baseUser);
      expect(hub.getPresenceList()).toHaveLength(1);
      dispose();
      expect(hub.getPresenceList()).toHaveLength(0);
    });

    it('multiple connections tracked separately', () => {
      hub.addClient('conn-1', makeClient(), baseUser);
      hub.addClient('conn-2', makeClient(), userB);
      expect(hub.getPresenceList()).toHaveLength(2);
    });
  });

  describe('broadcast', () => {
    it('sends JSON to all registered clients', () => {
      const clientA = makeClient();
      const clientB = makeClient();
      hub.addClient('conn-1', clientA, baseUser);
      hub.addClient('conn-2', clientB, userB);
      const msg = { type: 'stream:state' as const, payload: { state: 'live' as const } };
      hub.broadcast(msg);
      expect(clientA.send).toHaveBeenCalledWith(JSON.stringify(msg));
      expect(clientB.send).toHaveBeenCalledWith(JSON.stringify(msg));
    });

    it('does not throw if a client throws on send', () => {
      const throwing = {
        send: vi.fn().mockImplementation(() => {
          throw new Error('socket gone');
        }),
        close: vi.fn(),
      };
      const normal = makeClient();
      hub.addClient('conn-1', throwing, baseUser);
      hub.addClient('conn-2', normal, userB);
      const msg = { type: 'stream:state' as const, payload: { state: 'live' as const } };
      expect(() => hub.broadcast(msg)).not.toThrow();
      expect(normal.send).toHaveBeenCalled();
    });
  });

  describe('broadcastExcept', () => {
    it('sends to all clients EXCEPT the given connectionId', () => {
      const clientA = makeClient();
      const clientB = makeClient();
      hub.addClient('conn-1', clientA, baseUser);
      hub.addClient('conn-2', clientB, userB);
      const msg = { type: 'presence:join' as const, payload: baseUser };
      hub.broadcastExcept('conn-1', msg);
      expect(clientA.send).not.toHaveBeenCalled();
      expect(clientB.send).toHaveBeenCalledWith(JSON.stringify(msg));
    });

    it('still sends to OTHER clients when excluded id not found', () => {
      const clientA = makeClient();
      hub.addClient('conn-1', clientA, baseUser);
      const msg = { type: 'presence:join' as const, payload: baseUser };
      hub.broadcastExcept('nonexistent', msg);
      expect(clientA.send).toHaveBeenCalledWith(JSON.stringify(msg));
    });

    it('does not throw if connectionId is not found', () => {
      const msg = { type: 'presence:join' as const, payload: baseUser };
      expect(() => hub.broadcastExcept('nonexistent', msg)).not.toThrow();
    });

    it('does not throw if a client throws on send', () => {
      const throwing = {
        send: vi.fn().mockImplementation(() => {
          throw new Error('socket gone');
        }),
        close: vi.fn(),
      };
      const normal = makeClient();
      hub.addClient('conn-1', throwing, baseUser);
      hub.addClient('conn-2', normal, userB);
      const msg = { type: 'presence:join' as const, payload: baseUser };
      expect(() => hub.broadcastExcept('conn-3', msg)).not.toThrow();
      expect(normal.send).toHaveBeenCalled();
    });
  });

  describe('sendToUser', () => {
    it('sends message only to connections matching userId', () => {
      const clientA1 = makeClient();
      const clientA2 = makeClient();
      const clientB = makeClient();
      hub.addClient('conn-a1', clientA1, baseUser); // userId: 'user-001'
      hub.addClient('conn-a2', clientA2, baseUser); // userId: 'user-001'
      hub.addClient('conn-b', clientB, userB); // userId: 'user-002'

      const msg = { type: 'chat:ephemeral' as const, payload: {} as never };
      hub.sendToUser('user-001', msg);

      expect(clientA1.send).toHaveBeenCalledWith(JSON.stringify(msg));
      expect(clientA2.send).toHaveBeenCalledWith(JSON.stringify(msg));
      expect(clientB.send).not.toHaveBeenCalled();
    });

    it('does not throw if a client throws on send', () => {
      const throwing = {
        send: vi.fn().mockImplementation(() => {
          throw new Error('socket gone');
        }),
        close: vi.fn(),
      };
      hub.addClient('conn-1', throwing, baseUser);
      const msg = { type: 'chat:ephemeral' as const, payload: {} as never };
      expect(() => hub.sendToUser('user-001', msg)).not.toThrow();
    });
  });

  describe('revokeUserSessions', () => {
    it('sends session:revoked and closes connections for a given userId', () => {
      const clientA1 = makeClient();
      const clientA2 = makeClient();
      const clientB = makeClient();

      hub.addClient('conn-a1', clientA1, baseUser);
      hub.addClient('conn-a2', clientA2, baseUser);
      hub.addClient('conn-b', clientB, userB);

      hub.revokeUserSessions('user-001', 'banned');

      const expectedMsg = JSON.stringify({
        type: 'session:revoked',
        payload: { reason: 'banned' },
      });

      expect(clientA1.send).toHaveBeenCalledWith(expectedMsg);
      expect(clientA1.close).toHaveBeenCalled();
      expect(clientA2.send).toHaveBeenCalledWith(expectedMsg);
      expect(clientA2.close).toHaveBeenCalled();

      expect(clientB.send).not.toHaveBeenCalled();
      expect(clientB.close).not.toHaveBeenCalled();
    });

    it('does not throw if client.send or close throws', () => {
      const client = {
        send: vi.fn().mockImplementation(() => {
          throw new Error('gone');
        }),
        close: vi.fn().mockImplementation(() => {
          throw new Error('gone');
        }),
      };
      hub.addClient('conn-1', client, baseUser);
      expect(() => hub.revokeUserSessions('user-001', 'banned')).not.toThrow();
    });
  });

  describe('broadcastToAdmin', () => {
    it('sends message only to Admin-role connections', () => {
      const clientAdmin = makeClient();
      const clientViewer = makeClient();
      hub.addClient('conn-admin', clientAdmin, userB); // userB.role === 'Admin'
      hub.addClient('conn-viewer', clientViewer, baseUser); // baseUser.role === 'ViewerCompany'

      const msg = { type: 'pisugar:status' as const, payload: { connected: false as const } };
      hub.broadcastToAdmin(msg);

      expect(clientAdmin.send).toHaveBeenCalledWith(JSON.stringify(msg));
      expect(clientViewer.send).not.toHaveBeenCalled();
    });

    it('does not send to non-admin connections', () => {
      const clientA = makeClient();
      hub.addClient('conn-1', clientA, baseUser); // ViewerCompany, not Admin
      const msg = { type: 'pisugar:status' as const, payload: { connected: false as const } };
      hub.broadcastToAdmin(msg);
      expect(clientA.send).not.toHaveBeenCalled();
    });

    it('sends to multiple Admin connections', () => {
      const adminA = makeClient();
      const adminB = makeClient();
      hub.addClient('conn-a', adminA, userB);
      hub.addClient('conn-b', adminB, userB); // same admin, second session
      const msg = { type: 'pisugar:status' as const, payload: { connected: false as const } };
      hub.broadcastToAdmin(msg);
      expect(adminA.send).toHaveBeenCalledWith(JSON.stringify(msg));
      expect(adminB.send).toHaveBeenCalledWith(JSON.stringify(msg));
    });

    it('does not throw if an admin client throws on send', () => {
      const throwing = {
        send: vi.fn().mockImplementation(() => {
          throw new Error('socket gone');
        }),
        close: vi.fn(),
      };
      hub.addClient('conn-1', throwing, userB);
      const msg = { type: 'pisugar:status' as const, payload: { connected: false as const } };
      expect(() => hub.broadcastToAdmin(msg)).not.toThrow();
    });

    it('does not throw when no connections registered', () => {
      const msg = { type: 'pisugar:status' as const, payload: { connected: false as const } };
      expect(() => hub.broadcastToAdmin(msg)).not.toThrow();
    });
  });

  describe('getPresenceList', () => {
    it('returns empty array when no clients', () => {
      expect(hub.getPresenceList()).toEqual([]);
    });

    it('returns UserPresence[] matching added connections', () => {
      hub.addClient('conn-1', makeClient(), baseUser);
      hub.addClient('conn-2', makeClient(), userB);
      const list = hub.getPresenceList();
      expect(list).toHaveLength(2);
      expect(list.find((u) => u.id === 'user-001')).toEqual({
        id: 'user-001',
        displayName: 'Alice',
        avatarUrl: null,
        role: 'ViewerCompany',
        isMuted: false,
        userTag: null,
      });
      expect(list.find((u) => u.id === 'user-002')).toEqual({
        id: 'user-002',
        displayName: 'Bob',
        avatarUrl: 'https://example.com/bob.jpg',
        role: 'Admin',
        isMuted: false,
        userTag: { text: 'Staff', color: '#ff0000' },
      });
    });

    it('reflects correct state after dispose', () => {
      const dispose = hub.addClient('conn-1', makeClient(), baseUser);
      hub.addClient('conn-2', makeClient(), userB);
      dispose();
      const list = hub.getPresenceList();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('user-002');
    });

    it('deduplicates by userId — same user in two sessions appears only once', () => {
      hub.addClient('conn-1', makeClient(), baseUser);
      hub.addClient('conn-2', makeClient(), baseUser); // same userId, second session
      const list = hub.getPresenceList();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('user-001');
    });
  });

  describe('hasUserConnections', () => {
    it('returns false when no connections registered', () => {
      expect(hub.hasUserConnections('user-001')).toBe(false);
    });

    it('returns true when user has an active connection', () => {
      hub.addClient('conn-1', makeClient(), baseUser);
      expect(hub.hasUserConnections('user-001')).toBe(true);
    });

    it('returns false after user connection is disposed', () => {
      const dispose = hub.addClient('conn-1', makeClient(), baseUser);
      dispose();
      expect(hub.hasUserConnections('user-001')).toBe(false);
    });

    it('returns true when user has multiple connections (both active)', () => {
      hub.addClient('conn-1', makeClient(), baseUser);
      hub.addClient('conn-2', makeClient(), baseUser);
      expect(hub.hasUserConnections('user-001')).toBe(true);
    });

    it('returns true after one of two connections is disposed', () => {
      const dispose = hub.addClient('conn-1', makeClient(), baseUser);
      hub.addClient('conn-2', makeClient(), baseUser);
      dispose();
      expect(hub.hasUserConnections('user-001')).toBe(true);
    });

    it('returns false after all connections for user are disposed', () => {
      const d1 = hub.addClient('conn-1', makeClient(), baseUser);
      const d2 = hub.addClient('conn-2', makeClient(), baseUser);
      d1();
      d2();
      expect(hub.hasUserConnections('user-001')).toBe(false);
    });

    it('does not count connections of a different user', () => {
      hub.addClient('conn-1', makeClient(), userB);
      expect(hub.hasUserConnections('user-001')).toBe(false);
    });
  });
});
