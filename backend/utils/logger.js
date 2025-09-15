/**
 * Simple logger utility for the automation system
 */

class Logger {
  constructor() {
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    this.currentLevel = this.levels.info;
  }

  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level];
    }
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  }

  error(message, meta = {}) {
    if (this.currentLevel >= this.levels.error) {
      console.error(this.formatMessage('error', message, meta));
    }
  }

  warn(message, meta = {}) {
    if (this.currentLevel >= this.levels.warn) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  info(message, meta = {}) {
    if (this.currentLevel >= this.levels.info) {
      console.log(this.formatMessage('info', message, meta));
    }
  }

  debug(message, meta = {}) {
    if (this.currentLevel >= this.levels.debug) {
      console.log(this.formatMessage('debug', message, meta));
    }
  }
}

// Create and export a singleton logger instance
export const logger = new Logger();

// Set log level from environment variable if available
if (process.env.LOG_LEVEL) {
  logger.setLevel(process.env.LOG_LEVEL.toLowerCase());
}

export default logger;