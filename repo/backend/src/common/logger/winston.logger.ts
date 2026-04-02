import { LoggerService } from '@nestjs/common';
import * as winston from 'winston';

const winstonInstance = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
});

export function createWinstonLogger(): LoggerService {
  return {
    log: (message: string, context?: string) =>
      winstonInstance.info(message, { context }),
    error: (message: string, trace?: string, context?: string) =>
      winstonInstance.error(message, { trace, context }),
    warn: (message: string, context?: string) =>
      winstonInstance.warn(message, { context }),
    debug: (message: string, context?: string) =>
      winstonInstance.debug(message, { context }),
    verbose: (message: string, context?: string) =>
      winstonInstance.verbose(message, { context }),
  };
}

export { winstonInstance as logger };
