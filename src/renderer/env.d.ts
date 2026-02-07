/// <reference types="svelte" />
/// <reference types="vite/client" />

interface Session {
  id: string;
  name: string;
  type: 'claude' | 'copilot';
  status: 'active' | 'idle' | 'closed';
  metadata: {
    workingDir: string;
    gitRoot: string;
    gitBranch: string;
    model: string;
    contextUsed: string;
    lastMessage: string;
    waitingForInput: boolean;
  };
  createdAt: string;
}

interface ImportableSession {
  sessionId: string;
  project: string;
  lastMessage: string;
  timestamp: number;
  isActive: boolean;
  suggestedName: string;
}

interface TunnelHostInfo {
  instanceId: string;
  hostname: string;
  identityHash: string;
  address: string;
  port: number;
  status: 'discovered' | 'connecting' | 'connected' | 'disconnected';
}

interface Api {
  homeDir: string;
  quitApp: () => void;
  openFolderDialog: () => Promise<string | null>;
  openSessionsFileDialog: () => Promise<string | null>;
  loadSessionsFromFile: (filePath: string) => Promise<{ success: boolean; sessions?: Session[]; count?: number; error?: string }>;
  createSession: (
    type: 'claude' | 'copilot',
    workingDir: string,
    name?: string
  ) => Promise<{ success: boolean; session?: Session; error?: string }>;
  closeSession: (id: string) => Promise<{ success: boolean; error?: string }>;
  removeSession: (id: string) => Promise<{ success: boolean; error?: string }>;
  restartSession: (id: string) => Promise<{ success: boolean; session?: Session; error?: string }>;
  listSessions: () => Promise<Session[]>;
  activateSessions: () => Promise<void>;
  getSession: (id: string) => Promise<Session | undefined>;
  getImportableSessions: () => Promise<ImportableSession[]>;
  importSession: (project: string, name?: string) => Promise<{ success: boolean; session?: Session; error?: string }>;
  writeToSession: (id: string, data: string) => void;
  resizeSession: (id: string, cols: number, rows: number) => void;
  onSessionOutput: (callback: (id: string, data: string) => void) => () => void;
  onSessionExit: (callback: (id: string, exitCode: number) => void) => () => void;
  onSessionUpdate: (callback: (session: Session) => void) => () => void;

  clipboard: {
    writeText(text: string): void;
    readText(): string;
  };

  tunnel: {
    getStatus: () => Promise<{ enabled: boolean; identity: { hostname: string; identityHash: string } | null }>;
    getDiscoveredHosts: () => Promise<TunnelHostInfo[]>;
    getConnectedHosts: () => Promise<TunnelHostInfo[]>;
    connect: (instanceId: string) => Promise<boolean>;
    disconnect: (instanceId: string) => Promise<void>;
    listSessions: (instanceId: string) => Promise<Session[]>;
    createSession: (instanceId: string, type: 'claude' | 'copilot', workingDir: string, name?: string) => Promise<Session | null>;
    closeSession: (instanceId: string, sessionId: string) => Promise<boolean>;
    onHostFound: (callback: (host: TunnelHostInfo) => void) => () => void;
    onHostLost: (callback: (instanceId: string) => void) => () => void;
    onConnected: (callback: (instanceId: string) => void) => () => void;
    onDisconnected: (callback: (instanceId: string) => void) => () => void;
  };
}

declare global {
  interface Window {
    api: Api;
  }
}

export {};
