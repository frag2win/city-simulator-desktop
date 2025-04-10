const { Menu, app } = require('electron');

/**
 * Build the native OS application menu.
 * Platform-aware: uses Cmd on macOS, Ctrl on Windows/Linux.
 */
function buildAppMenu(mainWindow) {
    const isMac = process.platform === 'darwin';

    const template = [
        // macOS app menu
        ...(isMac
            ? [{
                label: app.name,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' },
                ],
            }]
            : []),

        // File
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open File…',
                    accelerator: isMac ? 'Cmd+O' : 'Ctrl+O',
                    click: () => {
                        mainWindow?.webContents.send('file:open');
                    },
                },
                { type: 'separator' },
                {
                    label: 'Export as GeoJSON',
                    accelerator: isMac ? 'Cmd+E' : 'Ctrl+E',
                    click: () => {
                        mainWindow?.webContents.send('menu:export', { format: 'geojson' });
                    },
                },
                {
                    label: 'Save as .city File',
                    accelerator: isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E',
                    click: () => {
                        mainWindow?.webContents.send('menu:export', { format: 'city' });
                    },
                },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' },
            ],
        },

        // View
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },

        // Simulation
        {
            label: 'Simulation',
            submenu: [
                {
                    label: 'Start Simulation',
                    accelerator: isMac ? 'Cmd+R' : 'Ctrl+Shift+R',
                    click: () => {
                        mainWindow?.webContents.send('menu:simulation', { action: 'start' });
                    },
                },
                {
                    label: 'Pause / Resume',
                    accelerator: 'Space',
                    click: () => {
                        mainWindow?.webContents.send('menu:simulation', { action: 'toggle' });
                    },
                },
                { type: 'separator' },
                {
                    label: 'Speed: 1×',
                    click: () => mainWindow?.webContents.send('menu:simulation', { action: 'speed', value: 1 }),
                },
                {
                    label: 'Speed: 2×',
                    click: () => mainWindow?.webContents.send('menu:simulation', { action: 'speed', value: 2 }),
                },
                {
                    label: 'Speed: 5×',
                    click: () => mainWindow?.webContents.send('menu:simulation', { action: 'speed', value: 5 }),
                },
                {
                    label: 'Speed: 10×',
                    click: () => mainWindow?.webContents.send('menu:simulation', { action: 'speed', value: 10 }),
                },
            ],
        },

        // Help
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About City Simulator',
                    click: () => {
                        const { dialog } = require('electron');
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About City Simulator',
                            message: 'Procedural 3D City Simulator',
                            detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nChrome: ${process.versions.chrome}\nNode: ${process.versions.node}`,
                        });
                    },
                },
                {
                    label: 'Open Logs Folder',
                    click: () => {
                        const { shell } = require('electron');
                        shell.openPath(app.getPath('userData'));
                    },
                },
            ],
        },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

module.exports = { buildAppMenu };
