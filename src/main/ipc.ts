import { ipcMain, dialog, BrowserWindow, app, shell } from 'electron';
import type { SessionManager } from './session/manager';
import type { SessionType } from './session/types';
import { getImportableSessions, getSessionNameFromProject } from './session/importer';
import { loadSavedSessions } from './session/persistence';
import { loadSessionsFromFile } from './session/loader';
import { isTunnelSessionId, parseTunnelSessionId } from './tunnel/protocol';
import type { TunnelManager } from './tunnel/manager';

// Track registered channels for cleanup
const registeredHandleChannels: string[] = [];
const registeredOnChannels: string[] = [];

export function cleanupIpcHandlers(): void {
  // Remove all handle channels
  for (const channel of registeredHandleChannels) {
    ipcMain.removeHandler(channel);
  }
  registeredHandleChannels.length = 0;

  // Remove all on channels
  for (const channel of registeredOnChannels) {
    ipcMain.removeAllListeners(channel);
  }
  registeredOnChannels.length = 0;
}

export function setupIpcHandlers(sessionManager: SessionManager, tunnelManager?: TunnelManager): void {
  // Track all channels for cleanup
  const handleChannels = [
    'session:create',
    'session:close',
    'session:remove',
    'session:restart',
    'session:list',
    'session:get',
    'dialog:openFolder',
    'session:getImportable',
    'session:import',
    'dialog:openSessionsFile',
    'session:loadFromFile',
    'shell:openExternal'
  ];
  const onChannels = ['session:write', 'session:resize', 'app:quit'];

  // Add tunnel channels if tunnel manager is available
  if (tunnelManager) {
    const tunnelHandleChannels = [
      'tunnel:getStatus',
      'tunnel:getDiscoveredHosts',
      'tunnel:getConnectedHosts',
      'tunnel:connect',
      'tunnel:disconnect',
      'tunnel:listSessions',
      'tunnel:createSession',
      'tunnel:closeSession'
    ];
    handleChannels.push(...tunnelHandleChannels);
  }

  registeredHandleChannels.push(...handleChannels);
  registeredOnChannels.push(...onChannels);

  // Create a new session
  ipcMain.handle(
    'session:create',
    async (_event, type: SessionType, workingDir: string, name?: string) => {
      try {
        const session = sessionManager.create({
          type,
          workingDir,
          name
        });
        // Serialize the session for IPC (Date -> string)
        const serializedSession = {
          ...session,
          createdAt: session.createdAt instanceof Date
            ? session.createdAt.toISOString()
            : session.createdAt
        };
        return { success: true, session: serializedSession };
      } catch (error) {
        console.error('Failed to create session:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // Close a session (keeps it in sidebar as inactive)
  ipcMain.handle('session:close', async (_event, id: string) => {
    try {
      // Route tunnel sessions to tunnel manager
      if (isTunnelSessionId(id) && tunnelManager) {
        const parsed = parseTunnelSessionId(id);
        if (parsed) {
          const result = await tunnelManager.closeRemoteSession(parsed.instanceId, parsed.remoteSessionId);
          return { success: result };
        }
        return { success: false, error: 'Invalid tunnel session ID' };
      }

      const result = sessionManager.close(id);
      return { success: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Remove a session permanently
  ipcMain.handle('session:remove', async (_event, id: string) => {
    try {
      const result = sessionManager.remove(id);
      return { success: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Restart an inactive session
  ipcMain.handle('session:restart', async (_event, id: string) => {
    try {
      const session = sessionManager.restart(id);
      if (session) {
        const serializedSession = {
          ...session,
          createdAt: session.createdAt instanceof Date
            ? session.createdAt.toISOString()
            : session.createdAt
        };
        return { success: true, session: serializedSession };
      }
      return { success: false, error: 'Session not found' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get all sessions
  ipcMain.handle('session:list', async () => {
    return sessionManager.list().map(session => ({
      ...session,
      createdAt: session.createdAt instanceof Date
        ? session.createdAt.toISOString()
        : session.createdAt
    }));
  });

  // Get a single session
  ipcMain.handle('session:get', async (_event, id: string) => {
    const session = sessionManager.get(id);
    if (!session) return undefined;
    return {
      ...session,
      createdAt: session.createdAt instanceof Date
        ? session.createdAt.toISOString()
        : session.createdAt
    };
  });

  // Write to a session (one-way, no response needed)
  ipcMain.on('session:write', (_event, id: string, data: string) => {
    // Route tunnel sessions to tunnel manager
    if (isTunnelSessionId(id) && tunnelManager) {
      const parsed = parseTunnelSessionId(id);
      if (parsed) {
        tunnelManager.writeRemoteSession(parsed.instanceId, parsed.remoteSessionId, data);
      }
      return;
    }
    sessionManager.write(id, data);
  });

  // Resize a session (one-way, no response needed)
  ipcMain.on('session:resize', (_event, id: string, cols: number, rows: number) => {
    // Route tunnel sessions to tunnel manager
    if (isTunnelSessionId(id) && tunnelManager) {
      const parsed = parseTunnelSessionId(id);
      if (parsed) {
        tunnelManager.resizeRemoteSession(parsed.instanceId, parsed.remoteSessionId, cols, rows);
      }
      return;
    }
    sessionManager.resize(id, cols, rows);
  });

  // Open folder picker dialog
  ipcMain.handle('dialog:openFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Working Directory'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Quit the app
  ipcMain.on('app:quit', () => {
    app.quit();
  });

  // Get importable Claude sessions from ~/.claude
  ipcMain.handle('session:getImportable', async () => {
    try {
      const existing = loadSavedSessions();
      const importable = getImportableSessions(existing);
      return importable.map(session => ({
        ...session,
        suggestedName: getSessionNameFromProject(session.project)
      }));
    } catch (error) {
      console.error('Failed to get importable sessions:', error);
      return [];
    }
  });

  // Import a Claude session
  ipcMain.handle('session:import', async (_event, project: string, name?: string) => {
    try {
      const sessionName = name || getSessionNameFromProject(project);
      const session = sessionManager.create({
        type: 'claude',
        workingDir: project,
        name: sessionName,
        resume: true // Use --continue
      });
      const serializedSession = {
        ...session,
        createdAt: session.createdAt instanceof Date
          ? session.createdAt.toISOString()
          : session.createdAt
      };
      return { success: true, session: serializedSession };
    } catch (error) {
      console.error('Failed to import session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Open JSON file picker for loading sessions
  ipcMain.handle('dialog:openSessionsFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
      title: 'Select Sessions Config File'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Load sessions from a JSON file
  ipcMain.handle('session:loadFromFile', async (_event, filePath: string) => {
    try {
      const configs = loadSessionsFromFile(filePath);
      const existingSessions = sessionManager.list();
      const sessions = [];
      let skipped = 0;

      for (const config of configs) {
        // Check if session already exists for this folder/type
        const exists = existingSessions.some(
          s => s.metadata.workingDir === config.folder && s.type === config.type
        );

        if (exists) {
          skipped++;
          continue;
        }

        const session = sessionManager.create({
          type: config.type,
          workingDir: config.folder,
          name: config.name,
          resume: config.type === 'claude' // Use --continue for Claude
        });
        const serializedSession = {
          ...session,
          createdAt: session.createdAt instanceof Date
            ? session.createdAt.toISOString()
            : session.createdAt
        };
        sessions.push(serializedSession);
      }

      return { success: true, sessions, count: sessions.length, skipped };
    } catch (error) {
      console.error('Failed to load sessions from file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Tunnel IPC handlers
  if (tunnelManager) {
    ipcMain.handle('tunnel:getStatus', async () => {
      return tunnelManager.getStatus();
    });

    ipcMain.handle('tunnel:getDiscoveredHosts', async () => {
      return tunnelManager.getDiscoveredHosts();
    });

    ipcMain.handle('tunnel:getConnectedHosts', async () => {
      return tunnelManager.getConnectedHosts();
    });

    ipcMain.handle('tunnel:connect', async (_event, instanceId: string) => {
      return tunnelManager.connect(instanceId);
    });

    ipcMain.handle('tunnel:disconnect', async (_event, instanceId: string) => {
      return tunnelManager.disconnect(instanceId);
    });

    ipcMain.handle('tunnel:listSessions', async (_event, instanceId: string) => {
      return tunnelManager.listRemoteSessions(instanceId);
    });

    ipcMain.handle('tunnel:createSession', async (
      _event,
      instanceId: string,
      type: 'claude' | 'copilot',
      workingDir: string,
      name?: string
    ) => {
      return tunnelManager.createRemoteSession(instanceId, type, workingDir, name);
    });

    ipcMain.handle('tunnel:closeSession', async (_event, instanceId: string, sessionId: string) => {
      return tunnelManager.closeRemoteSession(instanceId, sessionId);
    });
  }

  // Open URL in external browser
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    // Validate URL - only allow http and https
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { success: false, error: 'Invalid URL' };
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { success: false, error: 'Only http and https URLs are supported' };
    }

    try {
      await shell.openExternal(parsedUrl.href);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
}
