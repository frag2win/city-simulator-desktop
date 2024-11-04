const { getSidecarPort, getSidecarToken } = require('../sidecar/spawnPython');
const { logger } = require('../utils/logger');

/**
 * IPC handlers for city data operations.
 * These bridge between the renderer and the Python sidecar.
 */
function registerCityHandlers(ipcMain) {
    // city:load — Request city data for a bounding box
    ipcMain.handle('city:load', async (_event, { bbox }) => {
        const port = getSidecarPort();
        const token = getSidecarToken();

        if (!port) {
            return { error: true, message: 'Python sidecar is not running' };
        }

        try {
            logger.info('Loading city data', { bbox });
            const response = await fetch(`http://localhost:${port}/city?bbox=${bbox}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!response.ok) {
                throw new Error(`Sidecar responded with ${response.status}`);
            }

            const geojson = await response.json();
            logger.info('City data loaded', { featureCount: geojson.features?.length || 0 });
            return { error: false, data: geojson };
        } catch (err) {
            logger.error('City load failed', { error: err.message });
            return { error: true, message: err.message };
        }
    });
}

module.exports = { registerCityHandlers };
