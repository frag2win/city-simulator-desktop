/**
 * autoUpdater.js — Electron auto-update integration.
 * Uses electron-updater to check for updates from GitHub Releases.
 * Sends status updates to the renderer via IPC.
 */
const { logger } = require('../utils/logger');

let autoUpdater = null;
let mainWindow = null;

/**
 * Initialize the auto-updater. Only works in packaged builds.
 * @param {BrowserWindow} win - The main BrowserWindow instance
 */
function initAutoUpdater(win) {
    mainWindow = win;

    // electron-updater only works in packaged apps
    try {
        // Dynamic require — electron-updater may not be installed during dev
        const { autoUpdater: updater } = require('electron-updater');
        autoUpdater = updater;
    } catch {
        logger.info('electron-updater not available (development mode)');
        return;
    }

    // Configure
    autoUpdater.autoDownload = false; // Don't auto-download, let user decide
    autoUpdater.autoInstallOnAppQuit = true;

    // Events
    autoUpdater.on('checking-for-update', () => {
        logger.info('Checking for updates...');
        sendToRenderer('update:status', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        logger.info('Update available', { version: info.version });
        sendToRenderer('app:updateAvailable', {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes,
        });
    });

    autoUpdater.on('update-not-available', () => {
        logger.info('App is up to date');
        sendToRenderer('update:status', { status: 'up-to-date' });
    });

    autoUpdater.on('download-progress', (progress) => {
        sendToRenderer('update:progress', {
            percent: Math.round(progress.percent),
            transferred: progress.transferred,
            total: progress.total,
            speed: progress.bytesPerSecond,
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        logger.info('Update downloaded', { version: info.version });
        sendToRenderer('update:status', {
            status: 'ready',
            version: info.version,
        });
    });

    autoUpdater.on('error', (err) => {
        logger.error('Auto-updater error', { error: err.message });
        sendToRenderer('update:status', {
            status: 'error',
            message: err.message,
        });
    });

    // Check for updates after a short delay (don't block startup)
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
            logger.warn('Update check failed', { error: err.message });
        });
    }, 10000); // 10s after startup
}

function sendToRenderer(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

/**
 * Register IPC handlers for update-related actions from the renderer.
 */
function registerUpdateHandlers(ipcMain) {
    ipcMain.handle('update:check', async () => {
        if (!autoUpdater) return { error: true, message: 'Updater not available' };
        try {
            const result = await autoUpdater.checkForUpdates();
            return { error: false, version: result?.updateInfo?.version };
        } catch (err) {
            return { error: true, message: err.message };
        }
    });

    ipcMain.handle('update:download', async () => {
        if (!autoUpdater) return { error: true, message: 'Updater not available' };
        try {
            await autoUpdater.downloadUpdate();
            return { error: false };
        } catch (err) {
            return { error: true, message: err.message };
        }
    });

    ipcMain.handle('update:install', () => {
        if (autoUpdater) {
            autoUpdater.quitAndInstall(false, true);
        }
        return { error: false };
    });
}

module.exports = { initAutoUpdater, registerUpdateHandlers };
