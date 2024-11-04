const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Structured logger that writes to both console and a log file
 * in the app's userData directory.
 */
class Logger {
    constructor() {
        this.logDir = null;
        this.logStream = null;
        this._init();
    }

    _init() {
        try {
            // app.getPath might not be available immediately
            this.logDir = path.join(app.getPath('userData'), 'logs');
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }

            const logFile = path.join(this.logDir, `app-${this._dateStamp()}.log`);
            this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
        } catch {
            // Pre-ready state — just log to console
        }
    }

    _dateStamp() {
        return new Date().toISOString().slice(0, 10);
    }

    _timestamp() {
        return new Date().toISOString();
    }

    _write(level, message, data = {}) {
        const entry = {
            timestamp: this._timestamp(),
            level,
            message,
            ...data,
        };

        const line = JSON.stringify(entry);

        // Console output
        const prefix = `[${entry.timestamp}] [${level}]`;
        if (level === 'error') {
            console.error(prefix, message, data);
        } else if (level === 'warn') {
            console.warn(prefix, message, data);
        } else {
            console.log(prefix, message, Object.keys(data).length ? data : '');
        }

        // File output
        if (this.logStream) {
            this.logStream.write(line + '\n');
        }
    }

    info(message, data) { this._write('info', message, data); }
    warn(message, data) { this._write('warn', message, data); }
    error(message, data) { this._write('error', message, data); }
    debug(message, data) { this._write('debug', message, data); }
}

const logger = new Logger();

module.exports = { logger };
