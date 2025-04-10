const { dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * IPC handlers for file operations (export, open, save/load .city files).
 */
function registerFileHandlers(ipcMain, mainWindow) {

    // file:export — Open native save dialog and export data
    ipcMain.handle('file:export', async (_event, { format, data, cityName }) => {
        try {
            const filters = format === 'geojson'
                ? [{ name: 'GeoJSON', extensions: ['geojson', 'json'] }]
                : [{ name: 'City Simulator File', extensions: ['city'] }];

            const safeName = (cityName || 'city-export').replace(/[^a-zA-Z0-9_-]/g, '_');
            const ext = format === 'geojson' ? 'geojson' : 'city';

            const result = await dialog.showSaveDialog(mainWindow, {
                title: `Export as ${format.toUpperCase()}`,
                defaultPath: `${safeName}.${ext}`,
                filters,
            });

            if (result.canceled) {
                return { error: false, canceled: true };
            }

            // Write the file
            let content;
            if (format === 'geojson') {
                content = JSON.stringify(data, null, 2);
            } else {
                // .city format — wraps GeoJSON + simulation metadata
                const cityFile = {
                    version: '1.0.0',
                    format: 'city-simulator-session',
                    savedAt: new Date().toISOString(),
                    appVersion: app.getVersion(),
                    cityName: cityName || 'Unknown',
                    data: data,
                };
                content = JSON.stringify(cityFile, null, 2);
            }

            fs.writeFileSync(result.filePath, content, 'utf8');
            logger.info('File exported', { path: result.filePath, format, size: content.length });
            return { error: false, path: result.filePath };
        } catch (err) {
            logger.error('File export failed', { error: err.message });
            return { error: true, message: err.message };
        }
    });

    // file:open — Open native file dialog and read a .city or .geojson file
    ipcMain.handle('file:open', async () => {
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Open City File',
                filters: [
                    { name: 'City Files', extensions: ['city', 'geojson', 'json'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
                properties: ['openFile'],
            });

            if (result.canceled || result.filePaths.length === 0) {
                return { error: false, canceled: true };
            }

            const filePath = result.filePaths[0];
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw);

            logger.info('File opened', { path: filePath });

            // Detect format
            if (parsed.format === 'city-simulator-session') {
                // .city format
                return {
                    error: false,
                    data: parsed.data,
                    cityName: parsed.cityName || path.basename(filePath, '.city'),
                    meta: {
                        version: parsed.version,
                        savedAt: parsed.savedAt,
                        appVersion: parsed.appVersion,
                    },
                };
            } else if (parsed.type === 'FeatureCollection') {
                // Raw GeoJSON
                return {
                    error: false,
                    data: parsed,
                    cityName: path.basename(filePath, path.extname(filePath)),
                };
            } else {
                return { error: true, message: 'Unrecognized file format' };
            }
        } catch (err) {
            logger.error('File open failed', { error: err.message });
            return { error: true, message: err.message };
        }
    });

    // file:screenshot — Save a screenshot using native dialog
    ipcMain.handle('file:screenshot', async (_event, { dataUrl, cityName }) => {
        try {
            const safeName = (cityName || 'screenshot').replace(/[^a-zA-Z0-9_-]/g, '_');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

            const result = await dialog.showSaveDialog(mainWindow, {
                title: 'Save Screenshot',
                defaultPath: `city-sim-${safeName}-${timestamp}.png`,
                filters: [{ name: 'PNG Image', extensions: ['png'] }],
            });

            if (result.canceled) {
                return { error: false, canceled: true };
            }

            // Convert data URL to buffer and write
            const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(result.filePath, buffer);

            logger.info('Screenshot saved', { path: result.filePath, size: buffer.length });
            return { error: false, path: result.filePath };
        } catch (err) {
            logger.error('Screenshot save failed', { error: err.message });
            return { error: true, message: err.message };
        }
    });

    // Handle .city file opened via OS file association (double-click)
    app.on('open-file', (_event, filePath) => {
        try {
            if (!filePath.endsWith('.city') && !filePath.endsWith('.geojson')) return;
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw);

            if (mainWindow) {
                if (parsed.format === 'city-simulator-session') {
                    mainWindow.webContents.send('file:opened', {
                        data: parsed.data,
                        cityName: parsed.cityName,
                    });
                } else if (parsed.type === 'FeatureCollection') {
                    mainWindow.webContents.send('file:opened', {
                        data: parsed,
                        cityName: path.basename(filePath, path.extname(filePath)),
                    });
                }
            }
        } catch (err) {
            logger.error('Failed to open file from OS', { error: err.message, filePath });
        }
    });
}

module.exports = { registerFileHandlers };
