import type { WsMessage } from '@manlycam/types';

type WSClient = { send: (data: string) => void };

class WsHub {
  private readonly clients = new Set<WSClient>();

  addClient(client: WSClient): () => void {
    this.clients.add(client);
    return () => {
      this.clients.delete(client);
    };
  }

  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      try {
        client.send(data);
      } catch {
        // client disconnected between check and send; addClient dispose handles cleanup
      }
    }
  }
}

export const wsHub = new WsHub();
