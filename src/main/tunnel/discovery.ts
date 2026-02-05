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

    // Get address — prefer IPv4
    const address = service.referer?.address
      || service.addresses?.find((a: string) => !a.includes(':'))
      || service.addresses?.[0];
    if (!address) return;

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
