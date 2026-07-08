const fs = require('fs');
const path = require('path');
const { LOG_LEVEL, DEFAULT_PATHS } = require('../config/constants');

class Logger {
  constructor() {
    this.logsPath = DEFAULT_PATHS.logs;
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsPath)) {
      fs.mkdirSync(this.logsPath, { recursive: true });
    }
  }

  formatMessage(level, step, message, metadata = null) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      step: step || null,
      message,
      metadata
    });
  }

  writeToFile(filename, message) {
    const filepath = path.join(this.logsPath, filename);
    fs.appendFileSync(filepath, message + '\n');
  }

  log(level, step, message, metadata = null) {
    const formattedMessage = this.formatMessage(level, step, message, metadata);
    console.log(formattedMessage);
    if (level === LOG_LEVEL.ERROR) {
      this.writeToFile('error.log', formattedMessage);
      this.writeToFile('server.log', formattedMessage);
    } else {
      this.writeToFile('server.log', formattedMessage);
    }
  }

  info(step, message, metadata = null) {
    this.log(LOG_LEVEL.INFO, step, message, metadata);
  }

  warn(step, message, metadata = null) {
    this.log(LOG_LEVEL.WARN, step, message, metadata);
  }

  error(step, message, metadata = null) {
    this.log(LOG_LEVEL.ERROR, step, message, metadata);
  }

  debug(step, message, metadata = null) {
    this.log(LOG_LEVEL.DEBUG, step, message, metadata);
  }
}

module.exports = new Logger();
