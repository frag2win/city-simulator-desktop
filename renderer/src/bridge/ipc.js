/**
 * Typed wrapper around window.electronAPI (exposed by preload.js).
 * Provides a clean import for renderer components.
 */

const api = typeof window !== 'undefined' ? window.electronAPI : null;

export const ipc = {
    // Window controls
    windowMinimize: () => api?.windowMinimize(),
    windowMaximize: () => api?.windowMaximize(),
    windowClose: () => api?.windowClose(),
    windowIsMaximized: () => api?.windowIsMaximized(),

    // Sidecar
    getSidecarInfo: () => api?.getSidecarInfo(),

    // City
    loadCity: (bbox) => api?.loadCity(bbox),
    onCityLoaded: (cb) => api?.onCityLoaded(cb),
    onCityProgress: (cb) => api?.onCityProgress(cb),
    onCityError: (cb) => api?.onCityError(cb),

    // Simulation
    startSimulation: (config) => api?.startSimulation(config),
    sendSimulationEvent: (event) => api?.sendSimulationEvent(event),
    onSimulationState: (cb) => api?.onSimulationState(cb),
    onSimulationError: (cb) => api?.onSimulationError(cb),

    // Files
    exportFile: (options) => api?.exportFile(options),
    onFileOpen: (cb) => api?.onFileOpen(cb),

    // Status
    onSidecarStatus: (cb) => api?.onSidecarStatus(cb),
    onUpdateAvailable: (cb) => api?.onUpdateAvailable(cb),

    // Cleanup
    removeAllListeners: (channel) => api?.removeAllListeners(channel),
};

export default ipc;
