import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import type { SessionManager } from './session/manager';
import type { SessionType } from './session/types';
import { getImportableSessions, getSessionNameFromProject } from './session/importer';
import { loadSavedSessions } from './session/persistence';
import { loadSessionsFromFile } from './session/loader';

export function setupIpcHandlers(sessionManager: SessionManager): void {
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
    return sessionManager.list();
  });

  // Get a single session
  ipcMain.handle('session:get', async (_event, id: string) => {
    return sessionManager.get(id);
  });

  // Write to a session (one-way, no response needed)
  ipcMain.on('session:write', (_event, id: string, data: string) => {
    sessionManager.write(id, data);
  });

  // Resize a session (one-way, no response needed)
  ipcMain.on('session:resize', (_event, id: string, cols: number, rows: number) => {
    sessionManager.resize(id, cols, rows);
  });

  // Open folder picker dialog
  ipcMain.handle('dialog:openFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
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
      const sessions = [];

      for (const config of configs) {
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

      return { success: true, sessions, count: sessions.length };
    } catch (error) {
      console.error('Failed to load sessions from file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
}
