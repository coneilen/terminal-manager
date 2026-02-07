import { contextBridge, ipcRenderer, clipboard } from 'electron';
import { homedir } from 'os';

export interface Session {
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

export interface TunnelHostInfo {
  instanceId: string;
  hostname: string;
  identityHash: string;
  address: string;
  port: number;
  status: 'discovered' | 'connecting' | 'connected' | 'disconnected';
}

export interface Api {
  // Environment
  homeDir: string;

  // App control
  quitApp: () => void;
  openExternal: (url: string) => void;

  // Dialogs
  openFolderDialog: () => Promise<string | null>;
  openSessionsFileDialog: () => Promise<string | null>;

  // Bulk load sessions
  loadSessionsFromFile: (filePath: string) => Promise<{ success: boolean; sessions?: Session[]; count?: number; skipped?: number; error?: string }>;

  // Session management
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

  // PTY communication
  writeToSession: (id: string, data: string) => void;
  resizeSession: (id: string, cols: number, rows: number) => void;

  // Import sessions
  getImportableSessions: () => Promise<ImportableSession[]>;
  importSession: (project: string, name?: string) => Promise<{ success: boolean; session?: Session; error?: string }>;

  // Event listeners
  onSessionOutput: (callback: (id: string, data: string) => void) => () => void;
  onSessionExit: (callback: (id: string, exitCode: number) => void) => () => void;
  onSessionUpdate: (callback: (session: Session) => void) => () => void;

  // Clipboard
  clipboard: {
    writeText: (text: string) => void;
    readText: () => string;
  };

  // Tunnel API
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

export interface ImportableSession {
  sessionId: string;
  project: string;
  lastMessage: string;
  timestamp: number;
  isActive: boolean;
  suggestedName: string;
}

const api: Api = {
  // Environment
  homeDir: homedir(),

  // App control
  quitApp: () => ipcRenderer.send('app:quit'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Dialogs
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  openSessionsFileDialog: () => ipcRenderer.invoke('dialog:openSessionsFile'),

  // Bulk load sessions
  loadSessionsFromFile: (filePath) => ipcRenderer.invoke('session:loadFromFile', filePath),

  // Session management
  createSession: (type, workingDir, name) =>
    ipcRenderer.invoke('session:create', type, workingDir, name),

  closeSession: (id) => ipcRenderer.invoke('session:close', id),

  removeSession: (id) => ipcRenderer.invoke('session:remove', id),

  restartSession: (id) => ipcRenderer.invoke('session:restart', id),

  listSessions: () => ipcRenderer.invoke('session:list'),

  activateSessions: () => ipcRenderer.invoke('session:activate'),

  getSession: (id) => ipcRenderer.invoke('session:get', id),

  // Import sessions
  getImportableSessions: () => ipcRenderer.invoke('session:getImportable'),

  importSession: (project, name) => ipcRenderer.invoke('session:import', project, name),

  // PTY communication
  writeToSession: (id, data) => ipcRenderer.send('session:write', id, data),

  resizeSession: (id, cols, rows) => ipcRenderer.send('session:resize', id, cols, rows),

  // Event listeners with cleanup functions
  onSessionOutput: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, data: string) => {
      callback(id, data);
    };
    ipcRenderer.on('session:output', handler);
    return () => ipcRenderer.removeListener('session:output', handler);
  },

  onSessionExit: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, exitCode: number) => {
      callback(id, exitCode);
    };
    ipcRenderer.on('session:exit', handler);
    return () => ipcRenderer.removeListener('session:exit', handler);
  },

  onSessionUpdate: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, session: Session) => {
      callback(session);
    };
    ipcRenderer.on('session:update', handler);
    return () => ipcRenderer.removeListener('session:update', handler);
  },

  // Clipboard
  clipboard: {
    writeText: (text: string) => clipboard.writeText(text),
    readText: () => clipboard.readText()
  },

  // Tunnel API
  tunnel: {
    getStatus: () => ipcRenderer.invoke('tunnel:getStatus'),
    getDiscoveredHosts: () => ipcRenderer.invoke('tunnel:getDiscoveredHosts'),
    getConnectedHosts: () => ipcRenderer.invoke('tunnel:getConnectedHosts'),
    connect: (instanceId: string) => ipcRenderer.invoke('tunnel:connect', instanceId),
    disconnect: (instanceId: string) => ipcRenderer.invoke('tunnel:disconnect', instanceId),
    listSessions: (instanceId: string) => ipcRenderer.invoke('tunnel:listSessions', instanceId),
    createSession: (instanceId: string, type: 'claude' | 'copilot', workingDir: string, name?: string) =>
      ipcRenderer.invoke('tunnel:createSession', instanceId, type, workingDir, name),
    closeSession: (instanceId: string, sessionId: string) =>
      ipcRenderer.invoke('tunnel:closeSession', instanceId, sessionId),
    onHostFound: (callback: (host: TunnelHostInfo) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, host: TunnelHostInfo) => callback(host);
      ipcRenderer.on('tunnel:host-found', handler);
      return () => ipcRenderer.removeListener('tunnel:host-found', handler);
    },
    onHostLost: (callback: (instanceId: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, instanceId: string) => callback(instanceId);
      ipcRenderer.on('tunnel:host-lost', handler);
      return () => ipcRenderer.removeListener('tunnel:host-lost', handler);
    },
    onConnected: (callback: (instanceId: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, instanceId: string) => callback(instanceId);
      ipcRenderer.on('tunnel:connected', handler);
      return () => ipcRenderer.removeListener('tunnel:connected', handler);
    },
    onDisconnected: (callback: (instanceId: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, instanceId: string) => callback(instanceId);
      ipcRenderer.on('tunnel:disconnected', handler);
      return () => ipcRenderer.removeListener('tunnel:disconnected', handler);
    }
  }
};

contextBridge.exposeInMainWorld('api', api);

// Type declaration for the renderer
declare global {
  interface Window {
    api: Api;
  }
}
