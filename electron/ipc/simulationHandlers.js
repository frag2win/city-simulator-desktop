const { getSidecarPort, getSidecarToken } = require('../sidecar/spawnPython');
const { logger } = require('../utils/logger');

/**
 * IPC handlers for simulation operations.
 * Bridges renderer simulation commands to the Python sidecar WebSocket.
 */
function registerSimulationHandlers(ipcMain) {
    // simulation:start — Tell sidecar to begin simulation
    ipcMain.handle('simulation:start', async (_event, config) => {
        const port = getSidecarPort();
        const token = getSidecarToken();

        if (!port) {
            return { error: true, message: 'Python sidecar is not running' };
        }

        try {
            logger.info('Starting simulation', config);
            // In Phase 4, this will open a WebSocket to /ws/simulate
            // For now, return a stub acknowledgment
            return { error: false, message: 'Simulation start acknowledged (stub)' };
        } catch (err) {
            logger.error('Simulation start failed', { error: err.message });
            return { error: true, message: err.message };
        }
    });

    // simulation:event — Forward user-triggered events (road closure, power outage)
    ipcMain.handle('simulation:event', async (_event, eventData) => {
        const port = getSidecarPort();
        const token = getSidecarToken();

        if (!port) {
            return { error: true, message: 'Python sidecar is not running' };
        }

        try {
            logger.info('Simulation event', eventData);
            // Stub — will be implemented in Phase 4
            return { error: false, message: 'Event received (stub)' };
        } catch (err) {
            logger.error('Simulation event failed', { error: err.message });
            return { error: true, message: err.message };
        }
    });
}

module.exports = { registerSimulationHandlers };
