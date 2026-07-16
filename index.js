require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 4001;
const NODE_ENV = process.env.NODE_ENV || 'production';

const logger = require('./src/logger/logger');
const tradingRouter = require('./src/trading/tradingRouter');
const tradingScheduler = require('./src/trading/tradingScheduler');
const chartRouter = require('./src/chart/chartRouter');
const authRouter = require('./src/auth/authRouter');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'bittick-server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/trading', tradingRouter);
app.use('/api/chart', chartRouter);
app.use('/api/auth', authRouter);

app.use((err, req, res, next) => {
  logger.error('server', `Error: ${err.message}`);
  res.status(500).json({ exito: false, error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info('server', `Bittick Server iniciado en puerto ${PORT}`, { port: PORT, env: NODE_ENV });
  console.log(`Bittick Server corriendo en http://localhost:${PORT}`);

  setTimeout(async () => {
    try {
      const tradingStore = require('./src/trading/tradingStore');
      await tradingStore.init();
      tradingScheduler.start();
      logger.info('trading', 'Trading system initialized and scheduler started.');
    } catch (err) {
      logger.error('trading', `Trading init failed: ${err.message}`);
    }
  }, 1000);
});

process.on('SIGTERM', () => {
  logger.info('server', 'Recibido SIGTERM, cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('server', 'Recibido SIGINT, cerrando servidor...');
  process.exit(0);
});

module.exports = app;
