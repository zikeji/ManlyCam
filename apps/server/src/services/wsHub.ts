import type { Role, UserPresence, UserTag, WsMessage } from '@manlycam/types';

type WSClient = { send: (data: string) => void };

interface Connection {
  client: WSClient;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
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
          userTag: conn.userTag,
        });
      }
    }
    return result;
  }
}

export const wsHub = new WsHub();
