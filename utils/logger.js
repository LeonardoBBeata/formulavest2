let logger;
try {
  const pino = require('pino');
  const isProd = process.env.NODE_ENV === 'production';
  logger = pino({
    level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
    transport: isProd
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true }
        }
  });
} catch (err) {
  // fallback lightweight logger when pino isn't installed
  // keep API compatible: logger.info/error/debug
  logger = {
    info: (...args) => console.log('[info]', ...args),
    warn: (...args) => console.warn('[warn]', ...args),
    error: (...args) => console.error('[error]', ...args),
    debug: (...args) => console.debug ? console.debug('[debug]', ...args) : console.log('[debug]', ...args)
  };
}

module.exports = logger;
