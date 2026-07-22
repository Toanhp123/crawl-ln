import type { LoggerPort } from '../ports/logger.port.js';

export const logger: LoggerPort = {
  info(message) {
    console.log(`[info] ${message}`);
  },
  warn(message) {
    console.warn(`[warn] ${message}`);
  },
  error(message) {
    console.error(`[error] ${message}`);
  }
};
