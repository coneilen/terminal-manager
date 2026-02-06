import { randomUUID } from 'crypto';

// Wire protocol message types
export type TunnelMessage =
  | { type: 'key:exchange'; publicKey: string }
  | { type: 'auth:request'; identityHash: string; hostname: string; instanceId: string }
  | { type: 'auth:approved' }
  | { type: 'auth:denied'; reason: string }
  | { type: 'session:list'; requestId: string }
  | { type: 'session:list:response'; requestId: string; sessions: SerializedSession[] }
  | { type: 'session:create'; requestId: string; sessionType: 'claude' | 'copilot'; workingDir: string; name?: string }
  | { type: 'session:create:response'; requestId: string; session: SerializedSession | null; error?: string }
  | { type: 'session:close'; requestId: string; sessionId: string }
  | { type: 'session:close:response'; requestId: string; success: boolean }
  | { type: 'session:write'; sessionId: string; data: string }
  | { type: 'session:resize'; sessionId: string; cols: number; rows: number }
  | { type: 'session:output'; sessionId: string; data: string }
  | { type: 'session:update'; session: SerializedSession }
  | { type: 'session:exit'; sessionId: string; exitCode: number }
  | { type: 'disconnect' };

export interface TunnelHostInfo {
  instanceId: string;
  hostname: string;
  identityHash: string;
  address: string;
  port: number;
  status: 'discovered' | 'connecting' | 'connected' | 'disconnected';
}

export interface SerializedSession {
  id: string;
  name: string;
  type: 'claude' | 'copilot';
  status: 'active' | 'idle' | 'closed';
  metadata: {
    workingDir: string;
    gitBranch: string;
    model: string;
    contextUsed: string;
    lastMessage: string;
  };
  createdAt: string;
}

const TUNNEL_PREFIX = 'tunnel:';

export function makeTunnelSessionId(instanceId: string, remoteSessionId: string): string {
  return `${TUNNEL_PREFIX}${instanceId}:${remoteSessionId}`;
}

export function isTunnelSessionId(id: string): boolean {
  return id.startsWith(TUNNEL_PREFIX);
}

export function parseTunnelSessionId(id: string): { instanceId: string; remoteSessionId: string } | null {
  if (!isTunnelSessionId(id)) return null;
  const rest = id.slice(TUNNEL_PREFIX.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) return null;
  return {
    instanceId: rest.slice(0, colonIdx),
    remoteSessionId: rest.slice(colonIdx + 1)
  };
}

export function generateRequestId(): string {
  return randomUUID();
}
