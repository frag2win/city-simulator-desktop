const { dialog } = require('electron');
const { logger } = require('../utils/logger');

/**
 * IPC handlers for file operations (export, open).
 */
function registerFileHandlers(ipcMain, mainWindow) {
    // file:export — Open native save dialog and export data
    ipcMain.handle('file:export', async (_event, { format }) => {
        try {
            const filters = format === 'geojson'
                ? [{ name: 'GeoJSON', extensions: ['geojson', 'json'] }]
                : [{ name: 'City Simulator File', extensions: ['city'] }];

            const result = await dialog.showSaveDialog(mainWindow, {
                title: `Export as ${format.toUpperCase()}`,
                defaultPath: `city-export.${format === 'geojson' ? 'geojson' : 'city'}`,
                filters,
            });

            if (result.canceled) {
                return { error: false, canceled: true };
            }

            logger.info('File export', { path: result.filePath, format });
            // Actual file writing will be implemented in Phase 5
            return { error: false, path: result.filePath };
        } catch (err) {
            logger.error('File export failed', { error: err.message });
            return { error: true, message: err.message };
        }
    });
}

module.exports = { registerFileHandlers };
