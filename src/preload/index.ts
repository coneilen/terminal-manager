import { contextBridge, ipcRenderer } from 'electron';
import { homedir } from 'os';

export interface Session {
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

export interface Api {
  // Environment
  homeDir: string;

  // App control
  quitApp: () => void;

  // Dialogs
  openFolderDialog: () => Promise<string | null>;
  openSessionsFileDialog: () => Promise<string | null>;

  // Bulk load sessions
  loadSessionsFromFile: (filePath: string) => Promise<{ success: boolean; sessions?: Session[]; count?: number; error?: string }>;

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
  }
};

contextBridge.exposeInMainWorld('api', api);

// Type declaration for the renderer
declare global {
  interface Window {
    api: Api;
  }
}
