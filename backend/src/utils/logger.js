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
  defaultMeta: { service: 'hubspot-lead-automation' },
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
  // Use debug level to reduce console verbosity
  // Set LOG_LEVEL=debug to see detailed lead processing logs
  logger.debug('Lead Processing', {
    leadId,
    step,
    timestamp: new Date().toISOString(),
    ...data
  });
};

// Add webhook processing logging helper
logger.logWebhookProcessing = (trackingId, event, step, data = {}) => {
  logger.info('Webhook Processing', {
    trackingId,
    event,
    step,
    timestamp: new Date().toISOString(),
    ...data
  });
};

// Add meeting operations logging helper
logger.logMeetingOperation = (operation, meetingId, data = {}) => {
  logger.info('Meeting Operation', {
    operation,
    meetingId,
    timestamp: new Date().toISOString(),
    ...data
  });
};

// Add security event logging helper
logger.logSecurityEvent = (event, severity = 'warn', data = {}) => {
  logger[severity]('Security Event', {
    event,
    timestamp: new Date().toISOString(),
    severity,
    ...data
  });
};

// Add database operation logging helper
logger.logDatabaseOperation = (operation, table, data = {}) => {
  logger.debug('Database Operation', {
    operation,
    table,
    timestamp: new Date().toISOString(),
    ...data
  });
};

// Add performance logging helper
logger.logPerformance = (operation, duration, data = {}) => {
  const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
  logger[level]('Performance Metric', {
    operation,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
    ...data
  });
};

// Add validation logging helper
logger.logValidation = (type, result, data = {}) => {
  const level = result.isValid ? 'debug' : 'warn';
  logger[level]('Validation Result', {
    type,
    isValid: result.isValid,
    errors: result.errors || [],
    warnings: result.warnings || [],
    timestamp: new Date().toISOString(),
    ...data
  });
};

// Add transaction logging helper
logger.logTransaction = (transactionId, operation, status, data = {}) => {
  const level = status === 'failed' ? 'error' : status === 'rollback' ? 'warn' : 'info';
  logger[level]('Database Transaction', {
    transactionId,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...data
  });
};

export default logger;