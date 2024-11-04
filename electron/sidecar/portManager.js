const net = require('net');

/**
 * Finds a free port on localhost by binding to port 0.
 * The OS assigns an available port, which we read and release.
 * @returns {Promise<number>} A free port number
 */
function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

module.exports = { findFreePort };
