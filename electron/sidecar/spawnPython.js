const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const { BrowserWindow } = require('electron');
const { findFreePort } = require('./portManager');
const { logger } = require('../utils/logger');

let sidecarProcess = null;
let sidecarPort = null;
let sidecarToken = null;
let restartCount = 0;
const MAX_RESTARTS = 5;
const HEALTH_CHECK_INTERVAL = 5000; // 5 seconds
const STARTUP_TIMEOUT = 15000;      // 15 seconds (up from 10s for slow machines)
let healthCheckTimer = null;
let consecutiveHealthFailures = 0;
const MAX_HEALTH_FAILURES = 3;

/**
 * Generate a one-time auth token for the sidecar session.
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Broadcast sidecar status to all renderer windows.
 * @param {'ready'|'crashed'|'restarting'|'offline'} status
 * @param {string} [message]
 */
function broadcastSidecarStatus(status, message) {
    try {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
            if (!win.isDestroyed()) {
                win.webContents.send('sidecar:status', { status, message });
            }
        }
    } catch {
        // Window may not exist yet during startup
    }
}

/**
 * Get the Python executable path.
 * Priority: PYTHON_PATH env var → .venv in sidecar dir → system python.
 */
function getPythonPath() {
    if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;

    const fs = require('fs');
    const sidecarDir = getSidecarPath();

    // Check for .venv Python (Windows vs Unix)
    const venvPython = process.platform === 'win32'
        ? path.join(sidecarDir, '.venv', 'Scripts', 'python.exe')
        : path.join(sidecarDir, '.venv', 'bin', 'python');

    if (fs.existsSync(venvPython)) {
        logger.info('Using venv Python', { path: venvPython });
        return venvPython;
    }

    logger.info('No venv found, using system Python');
    return 'python';
}

/**
 * Get the path to the Python sidecar application.
 */
function getSidecarPath() {
    return path.join(__dirname, '..', '..', 'python-sidecar');
}

/**
 * Spawn the Python FastAPI sidecar process.
 * - Finds a free port
 * - Generates a one-time auth token
 * - Spawns the process
 * - Waits for the health check to pass
 */
async function spawnSidecar() {
    sidecarPort = await findFreePort();
    sidecarToken = generateToken();

    const pythonPath = getPythonPath();
    const sidecarDir = getSidecarPath();

    logger.info('Spawning Python sidecar', { port: sidecarPort, pythonPath, sidecarDir });

    return new Promise((resolve, reject) => {
        sidecarProcess = spawn(pythonPath, [
            '-m', 'app.main',
            '--port', String(sidecarPort),
            '--token', sidecarToken,
        ], {
            cwd: sidecarDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });

        // Log stdout
        sidecarProcess.stdout.on('data', (data) => {
            logger.info('[sidecar:stdout]', { message: data.toString().trim() });
        });

        // Log stderr
        sidecarProcess.stderr.on('data', (data) => {
            logger.warn('[sidecar:stderr]', { message: data.toString().trim() });
        });

        // Handle process exit
        sidecarProcess.on('exit', (code, signal) => {
            logger.warn('Sidecar process exited', { code, signal });
            sidecarProcess = null;
            stopHealthCheck();

            // Auto-restart with exponential backoff
            if (restartCount < MAX_RESTARTS) {
                restartCount++;
                const delay = Math.min(restartCount * 1000, 5000); // 1s, 2s, 3s, 4s, 5s
                logger.info(`Restarting sidecar in ${delay}ms (attempt ${restartCount}/${MAX_RESTARTS})`);
                broadcastSidecarStatus('restarting', `Engine crashed — restarting (attempt ${restartCount}/${MAX_RESTARTS})…`);
                setTimeout(() => {
                    spawnSidecar().catch((err) => {
                        logger.error('Sidecar restart failed', { error: err.message });
                        broadcastSidecarStatus('offline', 'Engine could not restart. Please restart the application.');
                    });
                }, delay);
            } else {
                logger.error('Sidecar max restarts reached — giving up');
                broadcastSidecarStatus('offline', `Engine crashed ${MAX_RESTARTS} times and will not restart. Please restart the application.`);
            }
        });

        sidecarProcess.on('error', (err) => {
            logger.error('Failed to spawn sidecar process', { error: err.message });
            reject(err);
        });

        // Wait for health check to pass
        waitForHealth(sidecarPort, sidecarToken, STARTUP_TIMEOUT)
            .then(() => {
                restartCount = 0; // Reset on successful start
                consecutiveHealthFailures = 0;
                startHealthCheck();
                broadcastSidecarStatus('ready', 'Engine is running');
                resolve();
            })
            .catch(reject);
    });
}

/**
 * Poll the sidecar /health endpoint until it responds OK or timeout.
 */
async function waitForHealth(port, token, timeoutMs) {
    const start = Date.now();
    const pollInterval = 500;

    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/health`, {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: AbortSignal.timeout(2000),
            });
            if (response.ok) {
                const data = await response.json();
                logger.info('Sidecar health check passed', data);
                return data;
            }
        } catch {
            // Sidecar not ready yet, keep polling
        }
        await new Promise((r) => setTimeout(r, pollInterval));
    }

    throw new Error(`Sidecar health check timed out after ${timeoutMs}ms`);
}

/**
 * Start periodic health checks. Auto-restarts sidecar if consecutive failures exceed threshold.
 */
function startHealthCheck() {
    stopHealthCheck();
    consecutiveHealthFailures = 0;
    healthCheckTimer = setInterval(async () => {
        if (!sidecarPort || !sidecarToken) return;
        try {
            const response = await fetch(`http://127.0.0.1:${sidecarPort}/health`, {
                headers: { 'Authorization': `Bearer ${sidecarToken}` },
                signal: AbortSignal.timeout(3000),
            });
            if (response.ok) {
                consecutiveHealthFailures = 0;
            } else {
                consecutiveHealthFailures++;
                logger.warn('Sidecar health check failed', { status: response.status, failures: consecutiveHealthFailures });
            }
        } catch {
            consecutiveHealthFailures++;
            logger.warn('Sidecar health check unreachable', { failures: consecutiveHealthFailures });
        }

        // If too many consecutive failures, kill and restart
        if (consecutiveHealthFailures >= MAX_HEALTH_FAILURES && sidecarProcess) {
            logger.error(`Sidecar unresponsive after ${MAX_HEALTH_FAILURES} health checks — forcing restart`);
            broadcastSidecarStatus('restarting', 'Engine unresponsive — restarting…');
            killSidecar();
            // killSidecar sets restartCount = MAX_RESTARTS to prevent auto-restart,
            // but here we want to restart, so reset it
            restartCount = Math.max(0, restartCount - 1);
            try { await spawnSidecar(); } catch (err) {
                logger.error('Forced restart failed', { error: err.message });
                broadcastSidecarStatus('offline', 'Engine could not restart.');
            }
        }
    }, HEALTH_CHECK_INTERVAL);
}

/**
 * Stop periodic health checks.
 */
function stopHealthCheck() {
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
    }
}

/**
 * Kill the sidecar process gracefully.
 */
function killSidecar() {
    stopHealthCheck();
    if (sidecarProcess) {
        logger.info('Killing sidecar process', { pid: sidecarProcess.pid });
        restartCount = MAX_RESTARTS; // Prevent auto-restart on intentional kill
        sidecarProcess.kill('SIGTERM');
        sidecarProcess = null;
    }
    sidecarPort = null;
    sidecarToken = null;
}

function getSidecarPort() {
    return sidecarPort;
}

function getSidecarToken() {
    return sidecarToken;
}

module.exports = {
    spawnSidecar,
    killSidecar,
    getSidecarPort,
    getSidecarToken,
};
