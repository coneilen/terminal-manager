import { writable, derived } from 'svelte/store';

export interface TunnelHostInfo {
  instanceId: string;
  hostname: string;
  identityHash: string;
  address: string;
  port: number;
  status: 'discovered' | 'connecting' | 'connected' | 'disconnected';
}

export const sidebarContext = writable<'local' | 'remote'>('local');

export const tunnelHosts = writable<TunnelHostInfo[]>([]);

export const selectedMachineId = writable<string | null>(null);

export const tunnelEnabled = writable<boolean>(false);

// Derived stores
export const selectedMachine = derived(
  [tunnelHosts, selectedMachineId],
  ([$tunnelHosts, $selectedMachineId]) => {
    if (!$selectedMachineId) return null;
    return $tunnelHosts.find((h) => h.instanceId === $selectedMachineId) || null;
  }
);

export const connectedHosts = derived(tunnelHosts, ($tunnelHosts) =>
  $tunnelHosts.filter((h) => h.status === 'connected')
);

export const discoveredHosts = derived(tunnelHosts, ($tunnelHosts) =>
  $tunnelHosts.filter((h) => h.status === 'discovered' || h.status === 'disconnected')
);

// Helpers
export function addOrUpdateHost(host: TunnelHostInfo): void {
  tunnelHosts.update((hosts) => {
    const idx = hosts.findIndex((h) => h.instanceId === host.instanceId);
    if (idx >= 0) {
      const updated = [...hosts];
      updated[idx] = host;
      return updated;
    }
    return [...hosts, host];
  });
}

export function removeHost(instanceId: string): void {
  tunnelHosts.update((hosts) => hosts.filter((h) => h.instanceId !== instanceId));
  selectedMachineId.update((id) => (id === instanceId ? null : id));
}

export function updateHostStatus(instanceId: string, status: TunnelHostInfo['status']): void {
  tunnelHosts.update((hosts) =>
    hosts.map((h) => (h.instanceId === instanceId ? { ...h, status } : h))
  );
}

export function selectMachine(instanceId: string | null): void {
  selectedMachineId.set(instanceId);
}
