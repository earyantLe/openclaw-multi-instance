import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, service, ...metadata }) => {
  let msg = `${timestamp} [${level}] ${message}`;
  if (service) msg = `[${service}] ${msg}`;

  const metadataKeys = Object.keys(metadata);
  if (metadataKeys.length) {
    msg += ` ${JSON.stringify(metadata)}`;
  }

  return msg;
});

// Daily rotate file transport
const dailyRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(process.env.LOG_DIR || 'logs', '%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d'
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  defaultMeta: { service: process.env.SERVICE_NAME || 'openclaw' },
  transports: [
    // Console output
    new winston.transports.Console({
      format: combine(colorize(), logFormat)
    }),
    // File output
    dailyRotateTransport
  ]
});

// Helper methods
export const auditLogger = (tenantId: string, userId: string, action: string, details?: any) => {
  logger.info('AUDIT', {
    tenantId,
    userId,
    action,
    ...details
  });
};

export const errorLogger = (error: Error, context?: Record<string, any>) => {
  logger.error(error.message, {
    stack: error.stack,
    ...context
  });
};

export const requestLogger = (req: any, res: any, duration?: number) => {
  logger.info(`${req.method} ${req.path}`, {
    statusCode: res.statusCode,
    duration,
    ip: req.ip
  });
};

export default logger;
