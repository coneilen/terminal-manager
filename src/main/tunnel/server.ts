import { EventEmitter } from 'events';
import { createServer, type Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { LocalIdentity } from './identity';
import type { SessionManager } from '../session/manager';
import type { TunnelMessage, SerializedSession } from './protocol';
import { generateKeyPair, encrypt, decrypt } from './crypto';

interface AuthenticatedClient {
  ws: WebSocket;
  instanceId: string;
  sharedSecret: Buffer;
}

export class TunnelServer extends EventEmitter {
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, AuthenticatedClient> = new Map();
  private actualPort: number;

  constructor(
    private identity: LocalIdentity,
    private sessionManager: SessionManager,
    private port: number
  ) {
    super();
    this.actualPort = port;
  }

  getPort(): number {
    return this.actualPort;
  }

  async start(): Promise<number> {
    // Try ports 9500-9510 on EADDRINUSE
    for (let p = this.port; p <= this.port + 10; p++) {
      try {
        await this.tryListen(p);
        this.actualPort = p;
        return p;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'EADDRINUSE' && p < this.port + 10) {
          continue;
        }
        throw err;
      }
    }
    throw new Error('All ports in range are in use');
  }

  private tryListen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer();
      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on('connection', (ws: WebSocket) => {
        this.handleConnection(ws);
      });

      this.httpServer.on('error', reject);
      // Bind to 0.0.0.0 explicitly to accept connections from all interfaces
      // (important on Windows where default behavior can vary)
      this.httpServer.listen(port, '0.0.0.0', () => {
        this.httpServer!.removeListener('error', reject);
        resolve();
      });
    });
  }

  private handleConnection(ws: WebSocket): void {
    const keyPair = generateKeyPair();
    let sharedSecret: Buffer | null = null;
    let authenticated = false;
    let clientInstanceId: string | null = null;

    // Send our public key
    this.sendRaw(ws, { type: 'key:exchange', publicKey: keyPair.publicKey });

    ws.on('message', (raw: Buffer) => {
      try {
        if (!sharedSecret) {
          // Expecting key exchange
          const msg: TunnelMessage = JSON.parse(raw.toString());
          if (msg.type === 'key:exchange') {
            sharedSecret = keyPair.computeSecret(msg.publicKey);
          }
          return;
        }

        if (!authenticated) {
          // Expecting encrypted auth request
          const decrypted = decrypt(sharedSecret, raw.toString());
          const msg: TunnelMessage = JSON.parse(decrypted);
          if (msg.type === 'auth:request') {
            if (msg.identityHash === this.identity.identityHash) {
              authenticated = true;
              clientInstanceId = msg.instanceId;
              this.clients.set(msg.instanceId, { ws, instanceId: msg.instanceId, sharedSecret });
              this.sendEncrypted(ws, sharedSecret, { type: 'auth:approved' });
              this.emit('client-connected', msg.instanceId);
            } else {
              this.sendEncrypted(ws, sharedSecret, { type: 'auth:denied', reason: 'Identity mismatch' });
              ws.close();
            }
          }
          return;
        }

        // Authenticated — handle messages
        const decrypted = decrypt(sharedSecret, raw.toString());
        const msg: TunnelMessage = JSON.parse(decrypted);
        this.handleMessage(ws, sharedSecret, msg);
      } catch (err) {
        console.error('[TunnelServer] Error handling message:', err);
      }
    });

    ws.on('close', () => {
      if (clientInstanceId) {
        this.clients.delete(clientInstanceId);
        this.emit('client-disconnected', clientInstanceId);
      }
    });

    ws.on('error', () => {
      // Close handler will clean up
    });
  }

  private handleMessage(ws: WebSocket, sharedSecret: Buffer, msg: TunnelMessage): void {
    switch (msg.type) {
      case 'session:list': {
        const sessions = this.sessionManager.list().map((s) => this.serializeSession(s));
        this.sendEncrypted(ws, sharedSecret, {
          type: 'session:list:response',
          requestId: msg.requestId,
          sessions
        });
        break;
      }
      case 'session:create': {
        try {
          const session = this.sessionManager.create({
            type: msg.sessionType,
            workingDir: msg.workingDir,
            name: msg.name
          });
          this.sendEncrypted(ws, sharedSecret, {
            type: 'session:create:response',
            requestId: msg.requestId,
            session: this.serializeSession(session)
          });
        } catch (err) {
          this.sendEncrypted(ws, sharedSecret, {
            type: 'session:create:response',
            requestId: msg.requestId,
            session: null,
            error: err instanceof Error ? err.message : 'Unknown error'
          });
        }
        break;
      }
      case 'session:close': {
        const success = this.sessionManager.close(msg.sessionId);
        this.sendEncrypted(ws, sharedSecret, {
          type: 'session:close:response',
          requestId: msg.requestId,
          success
        });
        break;
      }
      case 'session:write': {
        this.sessionManager.write(msg.sessionId, msg.data);
        break;
      }
      case 'session:resize': {
        this.sessionManager.resize(msg.sessionId, msg.cols, msg.rows);
        break;
      }
    }
  }

  broadcastSessionOutput(sessionId: string, data: string): void {
    this.broadcast({ type: 'session:output', sessionId, data });
  }

  broadcastSessionUpdate(session: SerializedSession): void {
    this.broadcast({ type: 'session:update', session });
  }

  broadcastSessionExit(sessionId: string, exitCode: number): void {
    this.broadcast({ type: 'session:exit', sessionId, exitCode });
  }

  private broadcast(msg: TunnelMessage): void {
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        this.sendEncrypted(client.ws, client.sharedSecret, msg);
      }
    }
  }

  private serializeSession(session: { id: string; name: string; type: string; status: string; metadata: unknown; createdAt: Date | string }): SerializedSession {
    return {
      ...session,
      type: session.type as 'claude' | 'copilot',
      status: session.status as 'active' | 'idle' | 'closed',
      metadata: session.metadata as SerializedSession['metadata'],
      createdAt: session.createdAt instanceof Date ? session.createdAt.toISOString() : session.createdAt as string
    };
  }

  private sendRaw(ws: WebSocket, msg: TunnelMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private sendEncrypted(ws: WebSocket, sharedSecret: Buffer, msg: TunnelMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encrypt(sharedSecret, JSON.stringify(msg)));
    }
  }

  async stop(): Promise<void> {
    // Send disconnect to all clients
    for (const client of this.clients.values()) {
      try {
        this.sendEncrypted(client.ws, client.sharedSecret, { type: 'disconnect' });
        client.ws.close(1000, 'Server shutting down');
      } catch {
        // Ignore close errors
      }
    }
    this.clients.clear();

    // Wait briefly for messages to drain
    await new Promise((r) => setTimeout(r, 200));

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
  }
}
