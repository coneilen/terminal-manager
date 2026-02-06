import { app, BrowserWindow, globalShortcut, shell } from 'electron';
import { join } from 'path';
import { setupIpcHandlers, cleanupIpcHandlers } from './ipc';
import { SessionManager } from './session/manager';
import { TunnelManager } from './tunnel/manager';

// Disable hardware acceleration to avoid GPU issues on some systems
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;
let tunnelManager: TunnelManager | null = null;

function createWindow(): void {
  // Determine icon path based on platform and environment
  const iconPath = process.platform === 'darwin'
    ? join(__dirname, '../../resources/icon.icns')
    : join(__dirname, '../../resources/icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1b26',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false // Required for node-pty
    }
  });

  // Initialize session manager
  sessionManager = new SessionManager(mainWindow);

  // Restore saved sessions BEFORE loading the renderer
  // This ensures sessions are available when the renderer calls listSessions()
  sessionManager.restoreSessions();

  // Initialize tunnel manager
  tunnelManager = new TunnelManager(mainWindow, sessionManager);

  // Set up IPC handlers (with tunnel manager)
  setupIpcHandlers(sessionManager, tunnelManager);

  // Start tunnel discovery (async, non-blocking)
  tunnelManager.start().catch((err) => {
    console.error('Failed to start tunnel manager:', err);
  });

  // Handle external links from window.open
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle navigation attempts (clicking links)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Prevent navigation and open in external browser instead
    event.preventDefault();
    shell.openExternal(url);
  });

  // Open DevTools in development mode only
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.openDevTools();
  }

  // Load the renderer - electron-vite sets ELECTRON_RENDERER_URL in dev mode
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('close', () => {
    // Clean up before window closes
    cleanupIpcHandlers();
    tunnelManager?.stop();
    if (sessionManager) {
      sessionManager.closeAll();
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
  // Check for updates in production only
  if (!process.env.ELECTRON_RENDERER_URL) {
    import('update-electron-app').then(({ updateElectronApp }) => {
      updateElectronApp({
        updateInterval: '1 hour',
        notifyUser: true
      });
    }).catch(() => {
      // Ignore update errors - don't prevent app from starting
    });
  }

  createWindow();
  registerGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Quit the app when window is closed (including on macOS)
  app.quit();
});

// Set shutdown flag early, before window closes
app.on('before-quit', () => {
  // Clean up IPC handlers first to stop receiving messages
  cleanupIpcHandlers();

  // Stop tunnel manager
  tunnelManager?.stop();

  // Then close all sessions
  if (sessionManager) {
    sessionManager.closeAll();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();

  // Force exit after a short delay to ensure cleanup completes
  // This handles cases where PTY processes or other resources prevent clean exit
  setTimeout(() => {
    process.exit(0);
  }, 500);
});
