const LOG_LEVEL = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
};

const path = require('path');

const DEFAULT_PATHS = {
  logs: process.env.LOGS_PATH || path.join(__dirname, '../../logs')
};

module.exports = { LOG_LEVEL, DEFAULT_PATHS };
