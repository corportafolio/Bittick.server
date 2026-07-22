const cron = require('node-cron');
const logger = require('../logger/logger');
const manager = require('./tradingManager');
const botManager = require('./botManager');

let scanJob = null;
let monitorJob = null;
let cleanupJob = null;

function start() {
  if (scanJob) return;

  scanJob = cron.schedule('* * * * *', async () => {
    logger.info('trading-scheduler', 'Running market scan...');
    try {
      const opportunities = await manager.scanMarket();
      if (opportunities.length > 0) {
        logger.info('trading-scheduler', `Scan complete. ${opportunities.length} opportunities found.`);
      }
    } catch (error) {
      logger.error('trading-scheduler', `Scan error: ${error.message}`);
    }
  });

  monitorJob = cron.schedule('* * * * *', async () => {
    try {
      await botManager.monitorPositions();
    } catch (error) {
      logger.error('trading-scheduler', `Monitor error: ${error.message}`);
    }
  });

  cleanupJob = cron.schedule('0 3 * * *', () => {
    const store = require('./tradingStore');
    store.deleteOldOpportunities(10);
    const cleaned = store.cleanupOldPositions(30, 50);
    store.cleanOldZones();
    logger.info('trading-scheduler', `Cleanup: old opportunities deleted, ${cleaned || 0} old positions archived, old zones cleaned.`);
  });

  logger.info('trading-scheduler', 'Trading scheduler started (scan every 1 min, monitor every 1 min, cleanup daily at 3AM).');
  scanJob.now();
}

function stop() {
  if (scanJob) { scanJob.stop(); scanJob = null; }
  if (monitorJob) { monitorJob.stop(); monitorJob = null; }
  if (cleanupJob) { cleanupJob.stop(); cleanupJob = null; }
}

module.exports = { start, stop };
