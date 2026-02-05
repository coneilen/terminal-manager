import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { LocalIdentity } from './identity';
import type { TunnelMessage, SerializedSession } from './protocol';
import { generateKeyPair, encrypt, decrypt } from './crypto';
import { generateRequestId } from './protocol';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT = 15000;

export class TunnelClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private sharedSecret: Buffer | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private connected = false;
  private reconnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = true;

  constructor(
    private identity: LocalIdentity,
    private remoteAddress: string,
    private remotePort: number,
    private remoteInstanceId: string
  ) {
    super();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  connect(): Promise<void> {
    this.shouldReconnect = true;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const keyPair = generateKeyPair();
      let handshakeComplete = false;

      this.ws = new WebSocket(`ws://${this.remoteAddress}:${this.remotePort}`);

      this.ws.on('open', () => {
        // Server sends key:exchange first, we wait for it
      });

      this.ws.on('message', (raw: Buffer) => {
        try {
          if (!this.sharedSecret) {
            // Expecting server's public key
            const msg: TunnelMessage = JSON.parse(raw.toString());
            if (msg.type === 'key:exchange') {
              this.sharedSecret = keyPair.computeSecret(msg.publicKey);
              // Send our public key
              this.sendRaw({ type: 'key:exchange', publicKey: keyPair.publicKey });
              // Send encrypted auth request
              this.sendEncrypted({
                type: 'auth:request',
                identityHash: this.identity.identityHash,
                hostname: this.identity.hostname,
                instanceId: this.identity.instanceId
              });
            }
            return;
          }

          if (!handshakeComplete) {
            const decrypted = decrypt(this.sharedSecret, raw.toString());
            const msg: TunnelMessage = JSON.parse(decrypted);
            if (msg.type === 'auth:approved') {
              handshakeComplete = true;
              this.connected = true;
              this.reconnecting = false;
              this.reconnectDelay = 1000; // Reset backoff
              this.emit('connected');
              resolve();
            } else if (msg.type === 'auth:denied') {
              this.shouldReconnect = false;
              reject(new Error(`Auth denied: ${msg.reason}`));
              this.ws?.close();
            }
            return;
          }

          // Authenticated — handle push messages
          const decrypted = decrypt(this.sharedSecret!, raw.toString());
          const msg: TunnelMessage = JSON.parse(decrypted);
          this.handleMessage(msg);
        } catch (err) {
          console.error('[TunnelClient] Error handling message:', err);
        }
      });

      this.ws.on('close', (code: number) => {
        const wasConnected = this.connected;
        this.connected = false;
        this.sharedSecret = null;
        this.rejectAllPending('Connection closed');

        if (wasConnected) {
          this.emit('disconnected');
        }

        // Auto-reconnect on non-clean disconnect
        if (this.shouldReconnect && code !== 1000) {
          this.scheduleReconnect();
        }

        if (!handshakeComplete) {
          reject(new Error('Connection closed during handshake'));
        }
      });

      this.ws.on('error', (err: Error) => {
        if (!handshakeComplete) {
          reject(err);
        }
        // Close handler will handle reconnection
      });
    });
  }

  private handleMessage(msg: TunnelMessage): void {
    switch (msg.type) {
      case 'session:list:response': {
        this.resolvePending(msg.requestId, msg.sessions);
        break;
      }
      case 'session:create:response': {
        this.resolvePending(msg.requestId, msg.session);
        break;
      }
      case 'session:close:response': {
        this.resolvePending(msg.requestId, msg.success);
        break;
      }
      case 'session:output': {
        this.emit('session:output', msg.sessionId, msg.data);
        break;
      }
      case 'session:update': {
        this.emit('session:update', msg.session);
        break;
      }
      case 'session:exit': {
        this.emit('session:exit', msg.sessionId, msg.exitCode);
        break;
      }
      case 'disconnect': {
        this.shouldReconnect = false;
        this.ws?.close(1000);
        break;
      }
    }
  }

  async listSessions(): Promise<SerializedSession[]> {
    const requestId = generateRequestId();
    this.sendEncrypted({ type: 'session:list', requestId });
    return this.waitForResponse(requestId) as Promise<SerializedSession[]>;
  }

  async createSession(
    sessionType: 'claude' | 'copilot',
    workingDir: string,
    name?: string
  ): Promise<SerializedSession | null> {
    const requestId = generateRequestId();
    this.sendEncrypted({ type: 'session:create', requestId, sessionType, workingDir, name });
    return this.waitForResponse(requestId) as Promise<SerializedSession | null>;
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const requestId = generateRequestId();
    this.sendEncrypted({ type: 'session:close', requestId, sessionId });
    return this.waitForResponse(requestId) as Promise<boolean>;
  }

  write(sessionId: string, data: string): void {
    this.sendEncrypted({ type: 'session:write', sessionId, data });
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sendEncrypted({ type: 'session:resize', sessionId, cols, rows });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.rejectAllPending('Disconnecting');
    if (this.ws) {
      try {
        this.sendEncrypted({ type: 'disconnect' });
      } catch {
        // Ignore
      }
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    this.connected = false;
    this.sharedSecret = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.shouldReconnect) return;

      try {
        await this.doConnect();
        this.emit('reconnected');
      } catch {
        // Exponential backoff
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        this.reconnecting = false;
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      }
    }, this.reconnectDelay);
  }

  private waitForResponse(requestId: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timed out'));
      }, REQUEST_TIMEOUT);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
    });
  }

  private resolvePending(requestId: string, value: unknown): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);
      pending.resolve(value);
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pendingRequests.delete(id);
    }
  }

  private sendRaw(msg: TunnelMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendEncrypted(msg: TunnelMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.sharedSecret) {
      this.ws.send(encrypt(this.sharedSecret, JSON.stringify(msg)));
    }
  }
}
