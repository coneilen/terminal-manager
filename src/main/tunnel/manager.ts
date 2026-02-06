import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import type { SessionManager } from '../session/manager';
import { detectIdentity, type LocalIdentity } from './identity';
import { TunnelDiscovery } from './discovery';
import { TunnelServer, type ClientInfo } from './server';
import { TunnelClient } from './client';
import {
  makeTunnelSessionId,
  type TunnelHostInfo,
  type SerializedSession
} from './protocol';

const DEFAULT_PORT = 9500;

export class TunnelManager extends EventEmitter {
  private identity: LocalIdentity | null = null;
  private discovery: TunnelDiscovery | null = null;
  private server: TunnelServer | null = null;
  private clients: Map<string, TunnelClient> = new Map();
  private hosts: Map<string, TunnelHostInfo> = new Map();
  private sessionManagerListeners: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  constructor(
    private mainWindow: BrowserWindow,
    private sessionManager: SessionManager
  ) {
    super();
  }

  async start(): Promise<void> {
    this.identity = detectIdentity();
    if (!this.identity) {
      console.log('[TunnelManager] No git email configured — tunneling disabled');
      return;
    }

    console.log(`[TunnelManager] Identity: ${this.identity.hostname} (${this.identity.identityHash})`);

    // Start server
    this.server = new TunnelServer(this.identity, this.sessionManager, DEFAULT_PORT);
    try {
      const port = await this.server.start();
      console.log(`[TunnelManager] Server listening on port ${port}`);

      // Start discovery with actual port
      this.discovery = new TunnelDiscovery(this.identity, port);
      this.setupDiscoveryHandlers();
      this.discovery.start();
      console.log(`[TunnelManager] Discovery started, broadcasting as ${this.identity.hostname}`);

      // Bridge SessionManager events to server broadcasts
      this.setupSessionManagerBridge();

      // Setup server event handlers — reverse discovery
      // When a remote machine connects to us as a client, register it as a
      // known host so we can also see and connect back to it. This handles
      // the case where mDNS only works one direction (common on Windows).
      this.server.on('client-connected', (info: ClientInfo) => {
        console.log(`[TunnelManager] Client connected: ${info.hostname} (${info.instanceId}) from ${info.address}`);

        if (!this.hosts.has(info.instanceId)) {
          const host: TunnelHostInfo = {
            instanceId: info.instanceId,
            hostname: info.hostname,
            identityHash: info.identityHash,
            address: info.address,
            port: info.port,
            status: 'discovered'
          };
          this.hosts.set(info.instanceId, host);
          this.sendToRenderer('tunnel:host-found', host);
          console.log(`[TunnelManager] Reverse-discovered host: ${info.hostname} at ${info.address}:${info.port}`);
        }
      });
      this.server.on('client-disconnected', (instanceId: string) => {
        console.log(`[TunnelManager] Client disconnected: ${instanceId}`);
      });
    } catch (err) {
      console.error('[TunnelManager] Failed to start server:', err);
    }
  }

  private setupDiscoveryHandlers(): void {
    if (!this.discovery) return;

    this.discovery.on('host-found', (host: TunnelHostInfo) => {
      this.hosts.set(host.instanceId, host);
      this.sendToRenderer('tunnel:host-found', host);
    });

    this.discovery.on('host-lost', (instanceId: string) => {
      const host = this.hosts.get(instanceId);
      this.hosts.delete(instanceId);

      // Disconnect client if connected
      const client = this.clients.get(instanceId);
      if (client) {
        client.disconnect();
        this.clients.delete(instanceId);
      }

      this.sendToRenderer('tunnel:host-lost', instanceId);
    });
  }

  private setupSessionManagerBridge(): void {
    const outputHandler = (...args: unknown[]) => {
      const [id, data] = args as [string, string];
      this.server?.broadcastSessionOutput(id, data);
    };
    const updateHandler = (...args: unknown[]) => {
      const [session] = args as [SerializedSession];
      this.server?.broadcastSessionUpdate(session);
    };
    const exitHandler = (...args: unknown[]) => {
      const [id, exitCode] = args as [string, number];
      this.server?.broadcastSessionExit(id, exitCode);
    };

    this.sessionManager.on('session:output', outputHandler);
    this.sessionManager.on('session:update', updateHandler);
    this.sessionManager.on('session:exit', exitHandler);

    this.sessionManagerListeners.push(
      { event: 'session:output', handler: outputHandler },
      { event: 'session:update', handler: updateHandler },
      { event: 'session:exit', handler: exitHandler }
    );
  }

  private setupClientHandlers(instanceId: string, client: TunnelClient): void {
    client.on('session:output', (sessionId: string, data: string) => {
      const tunnelId = makeTunnelSessionId(instanceId, sessionId);
      this.sendToRenderer('session:output', tunnelId, data);
    });

    client.on('session:update', (session: SerializedSession) => {
      const tunnelSession = {
        ...session,
        id: makeTunnelSessionId(instanceId, session.id)
      };
      this.sendToRenderer('session:update', tunnelSession);
    });

    client.on('session:exit', (sessionId: string, exitCode: number) => {
      const tunnelId = makeTunnelSessionId(instanceId, sessionId);
      this.sendToRenderer('session:exit', tunnelId, exitCode);
    });

    client.on('disconnected', () => {
      const host = this.hosts.get(instanceId);
      if (host) {
        host.status = 'disconnected';
        this.sendToRenderer('tunnel:disconnected', instanceId);
      }
    });

    client.on('reconnected', () => {
      const host = this.hosts.get(instanceId);
      if (host) {
        host.status = 'connected';
        this.sendToRenderer('tunnel:connected', instanceId);
      }
    });
  }

  // IPC-callable methods

  getStatus(): { enabled: boolean; identity: { hostname: string; identityHash: string } | null } {
    return {
      enabled: this.identity !== null,
      identity: this.identity
        ? { hostname: this.identity.hostname, identityHash: this.identity.identityHash }
        : null
    };
  }

  getDiscoveredHosts(): TunnelHostInfo[] {
    return Array.from(this.hosts.values());
  }

  getConnectedHosts(): TunnelHostInfo[] {
    return Array.from(this.hosts.values()).filter((h) => h.status === 'connected');
  }

  async connect(instanceId: string): Promise<boolean> {
    if (this.clients.has(instanceId)) return true; // Already connected

    const host = this.hosts.get(instanceId);
    if (!host || !this.identity) return false;

    host.status = 'connecting';
    this.sendToRenderer('tunnel:host-found', host); // Update status in renderer

    const client = new TunnelClient(
      this.identity,
      host.address,
      host.port,
      instanceId
    );

    this.setupClientHandlers(instanceId, client);

    try {
      await client.connect();
      this.clients.set(instanceId, client);
      host.status = 'connected';
      this.sendToRenderer('tunnel:connected', instanceId);
      return true;
    } catch (err) {
      console.error(`[TunnelManager] Failed to connect to ${instanceId}:`, err);
      host.status = 'discovered';
      this.sendToRenderer('tunnel:host-found', host); // Revert status
      return false;
    }
  }

  async disconnect(instanceId: string): Promise<void> {
    const client = this.clients.get(instanceId);
    if (client) {
      client.disconnect();
      this.clients.delete(instanceId);
    }

    const host = this.hosts.get(instanceId);
    if (host) {
      host.status = 'discovered';
    }
    this.sendToRenderer('tunnel:disconnected', instanceId);
  }

  async listRemoteSessions(instanceId: string): Promise<SerializedSession[]> {
    const client = this.clients.get(instanceId);
    if (!client || !client.isConnected) return [];
    return client.listSessions();
  }

  async createRemoteSession(
    instanceId: string,
    sessionType: 'claude' | 'copilot',
    workingDir: string,
    name?: string
  ): Promise<SerializedSession | null> {
    const client = this.clients.get(instanceId);
    if (!client || !client.isConnected) return null;
    return client.createSession(sessionType, workingDir, name);
  }

  async closeRemoteSession(instanceId: string, remoteSessionId: string): Promise<boolean> {
    const client = this.clients.get(instanceId);
    if (!client || !client.isConnected) return false;
    return client.closeSession(remoteSessionId);
  }

  writeRemoteSession(instanceId: string, remoteSessionId: string, data: string): void {
    const client = this.clients.get(instanceId);
    if (client?.isConnected) {
      client.write(remoteSessionId, data);
    }
  }

  resizeRemoteSession(instanceId: string, remoteSessionId: string, cols: number, rows: number): void {
    const client = this.clients.get(instanceId);
    if (client?.isConnected) {
      client.resize(remoteSessionId, cols, rows);
    }
  }

  async stop(): Promise<void> {
    // Disconnect all clients
    for (const [id, client] of this.clients) {
      client.disconnect();
      this.clients.delete(id);
    }

    // Stop server
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }

    // Stop discovery
    if (this.discovery) {
      this.discovery.stop();
      this.discovery = null;
    }

    // Remove SessionManager listeners
    for (const { event, handler } of this.sessionManagerListeners) {
      this.sessionManager.removeListener(event, handler);
    }
    this.sessionManagerListeners = [];

    this.hosts.clear();
  }

  private sendToRenderer(...args: unknown[]): void {
    try {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(...(args as [string, ...unknown[]]));
      }
    } catch {
      // Window may be destroyed
    }
  }
}
