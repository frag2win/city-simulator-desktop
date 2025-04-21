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
            return { error: true, message: 'Python engine is not running. Please restart the app.' };
        }

        try {
            logger.info('Loading city data', { bbox });
            const response = await fetch(`http://127.0.0.1:${port}/city?bbox=${encodeURIComponent(bbox)}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                const detail = body.detail || `Engine returned error ${response.status}`;
                logger.error('City load failed', { status: response.status, detail });
                return { error: true, message: detail };
            }

            const geojson = await response.json();
            logger.info('City data loaded', { featureCount: geojson.features?.length || 0 });
            return { error: false, data: geojson };
        } catch (err) {
            logger.error('City load failed', { error: err.message });
            return { error: true, message: err.message };
        }
    });

    // city:cache:list — List cached cities
    ipcMain.handle('city:cache:list', async () => {
        const port = getSidecarPort();
        const token = getSidecarToken();
        if (!port) return [];

        try {
            const response = await fetch(`http://127.0.0.1:${port}/city/cache`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) return await response.json();
            return [];
        } catch {
            return [];
        }
    });

    // city:cache:delete — Delete a cached city
    ipcMain.handle('city:cache:delete', async (_event, { cacheId }) => {
        const port = getSidecarPort();
        const token = getSidecarToken();
        if (!port) return false;

        try {
            const response = await fetch(`http://127.0.0.1:${port}/city/cache/${cacheId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            return response.ok;
        } catch {
            return false;
        }
    });
}

module.exports = { registerCityHandlers };
