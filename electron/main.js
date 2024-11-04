const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawnSidecar, killSidecar, getSidecarPort, getSidecarToken } = require('./sidecar/spawnPython');
const { registerCityHandlers } = require('./ipc/cityHandlers');
const { registerSimulationHandlers } = require('./ipc/simulationHandlers');
const { registerFileHandlers } = require('./ipc/fileHandlers');
const { buildAppMenu } = require('./menu/appMenu');
const { logger } = require('./utils/logger');

let mainWindow = null;
let isDev = !app.isPackaged;

function createWindow() {
  // Restore window state from electron-store if available
  const windowState = {
    width: 1400,
    height: 900,
    x: undefined,
    y: undefined,
  };

  mainWindow = new BrowserWindow({
    ...windowState,
    minWidth: 1024,
    minHeight: 680,
    frame: false,           // Frameless for custom title bar
    titleBarStyle: 'hidden', // macOS: hidden title bar
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '..', 'build', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,    // Security: no node in renderer
      contextIsolation: true,    // Security: isolate preload context
      sandbox: false,            // Needed for preload to use require patterns
    },
    show: false, // Show when ready to prevent flash
  });

  // Load the renderer
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
  }

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    logger.info('Main window shown');
  });

  // Window state persistence
  mainWindow.on('close', () => {
    const bounds = mainWindow.getBounds();
    logger.info('Window closing', { bounds });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Register IPC handlers
  registerCityHandlers(ipcMain);
  registerSimulationHandlers(ipcMain);
  registerFileHandlers(ipcMain, mainWindow);

  // Build native app menu
  buildAppMenu(mainWindow);

  return mainWindow;
}

// ─── App Lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
  logger.info('App starting', { version: app.getVersion(), isDev });

  // Spawn Python sidecar
  try {
    await spawnSidecar();
    logger.info('Python sidecar ready', {
      port: getSidecarPort(),
    });
  } catch (err) {
    logger.error('Failed to spawn Python sidecar', { error: err.message });
    // App can still launch — renderer will show "Engine Offline" status
  }

  createWindow();

  // macOS: re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup on quit
app.on('before-quit', () => {
  logger.info('App quitting — killing sidecar');
  killSidecar();
});

// IPC: Window controls from frameless title bar
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized());

// IPC: Sidecar info
ipcMain.handle('sidecar:getInfo', () => ({
  port: getSidecarPort(),
  token: getSidecarToken(),
}));
