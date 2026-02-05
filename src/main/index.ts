import { app, BrowserWindow, globalShortcut, shell } from 'electron';
import { join } from 'path';
import { setupIpcHandlers } from './ipc';
import { SessionManager } from './session/manager';

// Disable hardware acceleration to avoid GPU issues on some systems
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1b26',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false // Required for node-pty
    }
  });

  // Initialize session manager
  sessionManager = new SessionManager(mainWindow);

  // Set up IPC handlers
  setupIpcHandlers(sessionManager);

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Always open DevTools for debugging
  mainWindow.webContents.openDevTools();

  // Load the renderer - electron-vite sets ELECTRON_RENDERER_URL in dev mode
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Restore saved sessions once the renderer is ready
  mainWindow.webContents.on('did-finish-load', () => {
    if (sessionManager) {
      sessionManager.restoreSessions();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerGlobalShortcuts(): void {
  // Ctrl+Q to quit
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();
  registerGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();

  // Clean up all sessions
  if (sessionManager) {
    sessionManager.closeAll();
  }
});
