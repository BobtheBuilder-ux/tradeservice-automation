import { createLogger, format, transports } from 'winston';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure logs directory exists
const logsDir = join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ timestamp, level, message, service, ...meta }) => {
    let log = `${timestamp} [${service || 'app'}] ${level}: ${message}`;
    
    // Add metadata if present
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    if (metaStr) {
      log += `\n${metaStr}`;
    }
    
    return log;
  })
);

// Custom format for file output
const fileFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json()
);

// Create logger instance
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'facebook-lead-automation' },
  transports: [
    // Error log file
    new transports.File({
      filename: join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Combined log file
    new transports.File({
      filename: join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Console output
    new transports.Console({
      format: consoleFormat
    })
  ]
});

// Add request logging helper
logger.logRequest = (req, additionalData = {}) => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    ...additionalData
  });
};

// Add response logging helper
logger.logResponse = (req, res, additionalData = {}) => {
  logger.info('HTTP Response', {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: res.get('X-Response-Time'),
    ...additionalData
  });
};

// Add error logging helper
logger.logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context
  });
};

// Add lead processing logging helper
logger.logLeadProcessing = (leadId, step, data = {}) => {
  logger.info('Lead Processing', {
    leadId,
    step,
    timestamp: new Date().toISOString(),
    ...data
  });
};

export default logger;