const TUNNEL_PREFIX = 'tunnel:';

export function makeTunnelSessionId(instanceId: string, remoteSessionId: string): string {
  return `${TUNNEL_PREFIX}${instanceId}:${remoteSessionId}`;
}

export function isTunnelSessionId(id: string): boolean {
  return id.startsWith(TUNNEL_PREFIX);
}
