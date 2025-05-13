// logger.ts
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty', // optional for human-readable logs
  },
});

export default logger;
