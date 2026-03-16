import type { Role, UserPresence, UserTag, WsMessage } from '@manlycam/types';

type WSClient = { send: (data: string) => void; close: () => void };

interface Connection {
  client: WSClient;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  isMuted: boolean;
  userTag: UserTag | null;
}

export class WsHub {
  private readonly connections = new Map<string, Connection>();

  addClient(connectionId: string, client: WSClient, user: UserPresence): () => void {
    this.connections.set(connectionId, {
      client,
      userId: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isMuted: user.isMuted,
      userTag: user.userTag,
    });
    return () => {
      this.connections.delete(connectionId);
    };
  }

  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const conn of this.connections.values()) {
      try {
        conn.client.send(data);
      } catch {
        // client disconnected between check and send; addClient dispose handles cleanup
      }
    }
  }

  broadcastToAdmin(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const conn of this.connections.values()) {
      if (conn.role !== 'Admin') continue;
      try {
        conn.client.send(data);
      } catch {
        // client disconnected
      }
    }
  }

  broadcastExcept(connectionId: string, message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const [id, conn] of this.connections) {
      if (id === connectionId) continue;
      try {
        conn.client.send(data);
      } catch {
        // client disconnected
      }
    }
  }

  sendToUser(userId: string, message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const conn of this.connections.values()) {
      if (conn.userId !== userId) continue;
      try {
        conn.client.send(data);
      } catch {
        // client disconnected
      }
    }
  }

  revokeUserSessions(userId: string, reason: string): void {
    const data = JSON.stringify({ type: 'session:revoked', payload: { reason } });
    for (const conn of this.connections.values()) {
      if (conn.userId === userId) {
        try {
          conn.client.send(data);
          conn.client.close();
        } catch {
          // already closing or gone
        }
      }
    }
  }

  getPresenceList(): UserPresence[] {
    const seen = new Set<string>();
    const result: UserPresence[] = [];
    for (const conn of this.connections.values()) {
      if (!seen.has(conn.userId)) {
        seen.add(conn.userId);
        result.push({
          id: conn.userId,
          displayName: conn.displayName,
          avatarUrl: conn.avatarUrl,
          role: conn.role,
          isMuted: conn.isMuted,
          userTag: conn.userTag,
        });
      }
    }
    return result;
  }

  hasUserConnections(userId: string): boolean {
    for (const conn of this.connections.values()) {
      if (conn.userId === userId) return true;
    }
    return false;
  }
}

export const wsHub = new WsHub();
