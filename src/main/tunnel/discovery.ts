import { EventEmitter } from 'events';
import { createSocket, type Socket } from 'dgram';
import { networkInterfaces } from 'os';
import { Bonjour, type Service } from 'bonjour-service';
import type { LocalIdentity } from './identity';
import type { TunnelHostInfo } from './protocol';

const SERVICE_TYPE = 'terminal-manager';
const BEACON_PORT = 41832; // UDP broadcast port for fallback discovery
const BEACON_INTERVAL = 5000; // Broadcast every 5 seconds
const BEACON_MAGIC = 'TM_BEACON_V1';
const HOST_TIMEOUT = 20000; // Consider host lost after 20s without beacon

interface BeaconPayload {
  magic: string;
  instanceId: string;
  hostname: string;
  identityHash: string;
  port: number; // WebSocket server port
}

export class TunnelDiscovery extends EventEmitter {
  private bonjour: Bonjour | null = null;
  private browser: ReturnType<Bonjour['find']> | null = null;
  private hosts: Map<string, TunnelHostInfo> = new Map();

  // UDP beacon state
  private beaconSocket: Socket | null = null;
  private beaconTimer: ReturnType<typeof setInterval> | null = null;
  private hostLastSeen: Map<string, number> = new Map();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private identity: LocalIdentity,
    private port: number
  ) {
    super();
  }

  start(): void {
    this.startMdns();
    this.startBeacon();
  }

  // ── mDNS (works well on macOS, unreliable on Windows) ──

  private startMdns(): void {
    try {
      this.bonjour = new Bonjour();

      this.bonjour.publish({
        name: `tm-${this.identity.instanceId.slice(0, 8)}`,
        type: SERVICE_TYPE,
        port: this.port,
        txt: {
          instanceId: this.identity.instanceId,
          hostname: this.identity.hostname,
          identityHash: this.identity.identityHash
        }
      });

      this.browser = this.bonjour.find({ type: SERVICE_TYPE }, (service: Service) => {
        this.handleServiceFound(service);
      });

      this.browser.on('down', (service: Service) => {
        this.handleServiceLost(service);
      });
    } catch (err) {
      console.error('[TunnelDiscovery] mDNS failed to start, relying on UDP beacon:', err);
    }
  }

  private handleServiceFound(service: Service): void {
    const txt = service.txt as Record<string, string> | undefined;
    if (!txt) return;

    const { instanceId, hostname, identityHash } = txt;
    if (!instanceId || !identityHash) return;
    if (instanceId === this.identity.instanceId) return;
    if (identityHash !== this.identity.identityHash) return;

    const addresses = service.addresses || [];
    const address = addresses.find(
      (a: string) => !a.includes(':') && !a.startsWith('127.') && !a.startsWith('169.254.')
    ) || addresses.find((a: string) => !a.includes(':')) || addresses[0];

    if (!address) {
      console.log(`[TunnelDiscovery] mDNS: no usable address for ${hostname} (${instanceId})`);
      return;
    }

    console.log(`[TunnelDiscovery] mDNS: found ${hostname} at ${address}:${service.port}`);
    this.registerHost(instanceId, hostname, identityHash, address, service.port);
  }

  private handleServiceLost(_service: Service): void {
    // Don't remove immediately — the beacon sweep timer handles removal based on last-seen.
  }

  // ── UDP broadcast beacon (cross-platform fallback) ──

  private startBeacon(): void {
    try {
      this.beaconSocket = createSocket({ type: 'udp4', reuseAddr: true });

      this.beaconSocket.on('message', (msg, rinfo) => {
        this.handleBeacon(msg, rinfo.address);
      });

      this.beaconSocket.on('error', (err) => {
        console.error('[TunnelDiscovery] Beacon socket error:', err);
      });

      // Bind to all interfaces explicitly
      this.beaconSocket.bind(BEACON_PORT, '0.0.0.0', () => {
        this.beaconSocket!.setBroadcast(true);
        console.log(`[TunnelDiscovery] Beacon listening on UDP ${BEACON_PORT}`);

        // Start broadcasting
        this.sendBeacon(); // Send immediately
        this.beaconTimer = setInterval(() => this.sendBeacon(), BEACON_INTERVAL);
      });

      // Periodically sweep for timed-out hosts
      this.sweepTimer = setInterval(() => this.sweepStaleHosts(), BEACON_INTERVAL);
    } catch (err) {
      console.error('[TunnelDiscovery] Failed to start beacon:', err);
    }
  }

  /** Compute broadcast addresses for all active IPv4 network interfaces. */
  private getBroadcastAddresses(): string[] {
    const addresses: string[] = [];
    const ifaces = networkInterfaces();
    for (const ifaceList of Object.values(ifaces)) {
      if (!ifaceList) continue;
      for (const iface of ifaceList) {
        if (iface.family !== 'IPv4' || iface.internal) continue;
        // Compute broadcast = ip | ~netmask
        const ipParts = iface.address.split('.').map(Number);
        const maskParts = iface.netmask.split('.').map(Number);
        const broadcast = ipParts.map((ip, i) => (ip | (~maskParts[i] & 0xff))).join('.');
        addresses.push(broadcast);
      }
    }
    return addresses;
  }

  private sendBeacon(): void {
    if (!this.beaconSocket) return;

    const payload: BeaconPayload = {
      magic: BEACON_MAGIC,
      instanceId: this.identity.instanceId,
      hostname: this.identity.hostname,
      identityHash: this.identity.identityHash,
      port: this.port
    };

    const buf = Buffer.from(JSON.stringify(payload));
    const broadcastAddrs = this.getBroadcastAddresses();

    // Send to each subnet's directed broadcast address (most reliable)
    for (const addr of broadcastAddrs) {
      try {
        this.beaconSocket.send(buf, 0, buf.length, BEACON_PORT, addr);
      } catch {
        // Send can fail if network is down, ignore
      }
    }

    // Also send to limited broadcast as fallback
    try {
      this.beaconSocket.send(buf, 0, buf.length, BEACON_PORT, '255.255.255.255');
    } catch {
      // ignore
    }
  }

  private handleBeacon(msg: Buffer, senderAddress: string): void {
    let payload: BeaconPayload;
    try {
      payload = JSON.parse(msg.toString());
    } catch {
      return; // Not a valid beacon
    }

    if (payload.magic !== BEACON_MAGIC) return;
    if (!payload.instanceId || !payload.identityHash) return;
    if (payload.instanceId === this.identity.instanceId) return;
    if (payload.identityHash !== this.identity.identityHash) return;

    // Update last-seen timestamp
    this.hostLastSeen.set(payload.instanceId, Date.now());

    // Register or update host
    const existing = this.hosts.get(payload.instanceId);
    if (!existing) {
      console.log(`[TunnelDiscovery] Beacon: found ${payload.hostname} at ${senderAddress}:${payload.port}`);
    }

    this.registerHost(
      payload.instanceId,
      payload.hostname,
      payload.identityHash,
      senderAddress,
      payload.port
    );
  }

  private sweepStaleHosts(): void {
    const now = Date.now();
    for (const [instanceId, lastSeen] of this.hostLastSeen) {
      if (now - lastSeen > HOST_TIMEOUT) {
        this.hostLastSeen.delete(instanceId);
        if (this.hosts.has(instanceId)) {
          console.log(`[TunnelDiscovery] Host timed out: ${instanceId}`);
          this.hosts.delete(instanceId);
          this.emit('host-lost', instanceId);
        }
      }
    }
  }

  // ── Shared host registration ──

  private registerHost(
    instanceId: string,
    hostname: string,
    identityHash: string,
    address: string,
    port: number
  ): void {
    const existing = this.hosts.get(instanceId);

    // Don't overwrite a connected/connecting host's status
    if (existing && (existing.status === 'connected' || existing.status === 'connecting')) {
      // Update address/port in case it changed, keep status
      existing.address = address;
      existing.port = port;
      return;
    }

    const host: TunnelHostInfo = {
      instanceId,
      hostname: hostname || 'unknown',
      identityHash,
      address,
      port,
      status: existing?.status || 'discovered'
    };

    const isNew = !existing;
    this.hosts.set(instanceId, host);

    if (isNew) {
      this.emit('host-found', host);
    }
  }

  getDiscoveredHosts(): TunnelHostInfo[] {
    return Array.from(this.hosts.values());
  }

  stop(): void {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    if (this.beaconSocket) {
      try { this.beaconSocket.close(); } catch { /* ignore */ }
      this.beaconSocket = null;
    }
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
    }
    this.hosts.clear();
    this.hostLastSeen.clear();
  }
}
