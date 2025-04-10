const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script — exposes a typed API to the renderer via contextBridge.
 * The renderer accesses these methods via `window.electronAPI`.
 * No Node.js APIs are exposed directly (security best practice).
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // ─── Window Controls (frameless title bar) ─────────────
    windowMinimize: () => ipcRenderer.send('window:minimize'),
    windowMaximize: () => ipcRenderer.send('window:maximize'),
    windowClose: () => ipcRenderer.send('window:close'),
    windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),

    // ─── Sidecar Info ──────────────────────────────────────
    getSidecarInfo: () => ipcRenderer.invoke('sidecar:getInfo'),

    // ─── City Data ─────────────────────────────────────────
    loadCity: (bbox) => ipcRenderer.invoke('city:load', { bbox }),
    listCachedCities: () => ipcRenderer.invoke('city:cache:list'),
    deleteCachedCity: (cacheId) => ipcRenderer.invoke('city:cache:delete', { cacheId }),
    onCityLoaded: (callback) => {
        ipcRenderer.on('city:loaded', (_event, data) => callback(data));
    },
    onCityProgress: (callback) => {
        ipcRenderer.on('city:progress', (_event, data) => callback(data));
    },
    onCityError: (callback) => {
        ipcRenderer.on('city:error', (_event, data) => callback(data));
    },

    // ─── Simulation ────────────────────────────────────────
    startSimulation: (config) => ipcRenderer.invoke('simulation:start', config),
    sendSimulationEvent: (event) => ipcRenderer.invoke('simulation:event', event),
    onSimulationState: (callback) => {
        ipcRenderer.on('simulation:state', (_event, data) => callback(data));
    },
    onSimulationError: (callback) => {
        ipcRenderer.on('simulation:error', (_event, data) => callback(data));
    },

    // ─── File Operations ───────────────────────────────────
    exportFile: (options) => ipcRenderer.invoke('file:export', options),
    openFile: () => ipcRenderer.invoke('file:open'),
    saveScreenshot: (options) => ipcRenderer.invoke('file:screenshot', options),
    onFileOpen: (callback) => {
        ipcRenderer.on('file:open', (_event, data) => callback(data));
    },
    onFileOpened: (callback) => {
        ipcRenderer.on('file:opened', (_event, data) => callback(data));
    },

    // ─── Sidecar Status ────────────────────────────────────
    onSidecarStatus: (callback) => {
        ipcRenderer.on('sidecar:status', (_event, data) => callback(data));
    },

    // ─── App Updates ───────────────────────────────────────
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('app:updateAvailable', (_event, data) => callback(data));
    },
    onUpdateProgress: (callback) => {
        ipcRenderer.on('update:progress', (_event, data) => callback(data));
    },
    onUpdateReady: (callback) => {
        ipcRenderer.on('update:status', (_event, data) => {
            if (data.status === 'ready') callback(data);
        });
    },
    downloadUpdate: () => ipcRenderer.invoke('update:download'),
    installUpdate: () => ipcRenderer.invoke('update:install'),

    // ─── Cleanup ───────────────────────────────────────────
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },
});
