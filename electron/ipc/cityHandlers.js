const { getSidecarPort, getSidecarToken, spawnSidecar } = require('../sidecar/spawnPython');
const { logger } = require('../utils/logger');

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1501;

/**
 * Fetch helper with retry + auto-restart of sidecar on ECONNREFUSED.
 * @param {Function} fetchFn — async function that performs the fetch, receives (port, token)
 * @param {string} label — for logging
 * @param {number} retries — remaining retries
 */
async function fetchWithRetry(fetchFn, label, retries = MAX_RETRIES) {
    let port = getSidecarPort();
    let token = getSidecarToken();

    if (!port) {
        // Attempt to restart the sidecar if not running
        logger.warn(`${label}: sidecar not running, attempting restart…`);
        try {
            await spawnSidecar();
            port = getSidecarPort();
            token = getSidecarToken();
        } catch (err) {
            logger.error(`${label}: sidecar restart failed`, { error: err.message });
            return { error: true, message: 'Python engine is not running and could not restart. Please restart the app.' };
        }
    }

    try {
        return await fetchFn(port, token);
    } catch (err) {
        const isConnection = err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch failed');
        if (isConnection && retries > 0) {
            logger.warn(`${label}: connection failed, retrying in ${RETRY_DELAY_MS}ms (${retries} left)`, { error: err.message });
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));

            // Try restarting sidecar before retry
            try { await spawnSidecar(); } catch { /* ignore — might already be running */ }

            return fetchWithRetry(fetchFn, label, retries - 1);
        }
        throw err; // re-throw for caller to handle
    }
}

/**
 * IPC handlers for city data operations.
 * These bridge between the renderer and the Python sidecar.
 * Includes retry logic and automatic sidecar restart on connection failures.
 */
function registerCityHandlers(ipcMain) {
    // city:load — Request city data for a bounding box
    ipcMain.handle('city:load', async (_event, { bbox }) => {
        try {
            return await fetchWithRetry(async (port, token) => {
                logger.info('Loading city data', { bbox, port });
                const url = `http://127.0.0.1:${port}/city?bbox=${encodeURIComponent(bbox)}`;
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    signal: AbortSignal.timeout(90000),
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
            }, 'city:load');
        } catch (err) {
            logger.error('City load failed after retries', { error: err.message, name: err.name });

            if (err.name === 'TimeoutError') {
                return { error: true, message: 'Request timed out — the area may be too large. Try a smaller area.' };
            }
            if (err.message?.includes('ECONNREFUSED')) {
                return { error: true, message: 'Cannot connect to the engine after retries. Please restart the app.' };
            }
            return { error: true, message: err.message || 'Unknown error loading city' };
        }
    });

    // city:cache:list — List cached cities
    ipcMain.handle('city:cache:list', async () => {
        try {
            return await fetchWithRetry(async (port, token) => {
                const response = await fetch(`http://127.0.0.1:${port}/city/cache`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    signal: AbortSignal.timeout(10000),
                });
                if (response.ok) return await response.json();
                return [];
            }, 'city:cache:list');
        } catch {
            return [];
        }
    });

    // city:cache:delete — Delete a cached city
    ipcMain.handle('city:cache:delete', async (_event, { cacheId }) => {
        try {
            return await fetchWithRetry(async (port, token) => {
                const response = await fetch(`http://127.0.0.1:${port}/city/cache/${cacheId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` },
                    signal: AbortSignal.timeout(10000),
                });
                return response.ok;
            }, 'city:cache:delete');
        } catch {
            return false;
        }
    });
}

module.exports = { registerCityHandlers };
