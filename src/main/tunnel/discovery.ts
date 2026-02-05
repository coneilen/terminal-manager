import { EventEmitter } from 'events';
import { Bonjour, type Service } from 'bonjour-service';
import type { LocalIdentity } from './identity';
import type { TunnelHostInfo } from './protocol';

const SERVICE_TYPE = 'terminal-manager';

export class TunnelDiscovery extends EventEmitter {
  private bonjour: Bonjour | null = null;
  private browser: ReturnType<Bonjour['find']> | null = null;
  private hosts: Map<string, TunnelHostInfo> = new Map();

  constructor(
    private identity: LocalIdentity,
    private port: number
  ) {
    super();
  }

  start(): void {
    this.bonjour = new Bonjour();

    // Publish our service
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

    // Browse for peers
    this.browser = this.bonjour.find({ type: SERVICE_TYPE }, (service: Service) => {
      this.handleServiceFound(service);
    });

    // Handle service disappearance
    this.browser.on('down', (service: Service) => {
      this.handleServiceLost(service);
    });
  }

  private handleServiceFound(service: Service): void {
    const txt = service.txt as Record<string, string> | undefined;
    if (!txt) return;

    const { instanceId, hostname, identityHash } = txt;
    if (!instanceId || !identityHash) return;

    // Skip own instance
    if (instanceId === this.identity.instanceId) return;

    // Only show peers with matching identity
    if (identityHash !== this.identity.identityHash) return;

    // Get address from DNS records (service.addresses), NOT referer.address
    // referer.address is the network-level source of the mDNS packet which
    // can be a gateway/router IP on cross-subnet or bridged networks.
    // Prefer a routable IPv4 address, skip loopback and link-local.
    const addresses = service.addresses || [];
    const address = addresses.find(
      (a: string) => !a.includes(':') && !a.startsWith('127.') && !a.startsWith('169.254.')
    ) || addresses.find((a: string) => !a.includes(':')) || addresses[0];

    if (!address) {
      console.log(`[TunnelDiscovery] No usable address for ${hostname} (${instanceId}), addresses: ${JSON.stringify(addresses)}`);
      return;
    }

    console.log(`[TunnelDiscovery] Found peer ${hostname} at ${address}:${service.port} (addresses: ${JSON.stringify(addresses)})`);

    const host: TunnelHostInfo = {
      instanceId,
      hostname: hostname || 'unknown',
      identityHash,
      address,
      port: service.port,
      status: 'discovered'
    };

    this.hosts.set(instanceId, host);
    this.emit('host-found', host);
  }

  private handleServiceLost(service: Service): void {
    const txt = service.txt as Record<string, string> | undefined;
    if (!txt?.instanceId) return;

    const instanceId = txt.instanceId;
    if (this.hosts.has(instanceId)) {
      this.hosts.delete(instanceId);
      this.emit('host-lost', instanceId);
    }
  }

  getDiscoveredHosts(): TunnelHostInfo[] {
    return Array.from(this.hosts.values());
  }

  stop(): void {
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
    }
    this.hosts.clear();
  }
}
