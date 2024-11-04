const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const { findFreePort } = require('./portManager');
const { logger } = require('../utils/logger');

let sidecarProcess = null;
let sidecarPort = null;
let sidecarToken = null;
let restartCount = 0;
const MAX_RESTARTS = 3;
const HEALTH_CHECK_INTERVAL = 5000; // 5 seconds
const STARTUP_TIMEOUT = 10000;      // 10 seconds
let healthCheckTimer = null;

/**
 * Generate a one-time auth token for the sidecar session.
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Get the Python executable path.
 * In dev: uses system Python. In production: uses bundled PyInstaller binary.
 */
function getPythonPath() {
    // In production, the sidecar is bundled as a PyInstaller binary
    // For now (dev mode), use system Python
    return process.env.PYTHON_PATH || 'python';
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

            // Auto-restart with backoff
            if (restartCount < MAX_RESTARTS) {
                restartCount++;
                const delay = restartCount * 1000; // 1s, 2s, 3s
                logger.info(`Restarting sidecar in ${delay}ms (attempt ${restartCount}/${MAX_RESTARTS})`);
                setTimeout(() => {
                    spawnSidecar().catch((err) => {
                        logger.error('Sidecar restart failed', { error: err.message });
                    });
                }, delay);
            } else {
                logger.error('Sidecar max restarts reached — giving up');
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
                startHealthCheck();
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
 * Start periodic health checks.
 */
function startHealthCheck() {
    stopHealthCheck();
    healthCheckTimer = setInterval(async () => {
        if (!sidecarPort || !sidecarToken) return;
        try {
            const response = await fetch(`http://127.0.0.1:${sidecarPort}/health`, {
                headers: { 'Authorization': `Bearer ${sidecarToken}` },
                signal: AbortSignal.timeout(3000),
            });
            if (!response.ok) {
                logger.warn('Sidecar health check failed', { status: response.status });
            }
        } catch {
            logger.warn('Sidecar health check unreachable');
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
