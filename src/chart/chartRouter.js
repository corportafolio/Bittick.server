const express = require('express');
const binance = require('../trading/binanceClient');
const renkoStrategy = require('../trading/strategies/renkoAccumulationStrategy');
const logger = require('../logger/logger');

const router = express.Router();

const VALID_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];

router.get('/klines', async (req, res) => {
  try {
    const interval = VALID_INTERVALS.includes(req.query.interval) ? req.query.interval : '1h';
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const type = req.query.type === 'futures' ? 'futures' : 'spot';

    const klines = await binance.getKlines('BTCUSDT', interval, limit, type);
    res.json({ exito: true, data: klines });
  } catch (error) {
    logger.error('chart-api', `GET klines error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/ticker', async (req, res) => {
  try {
    const ticker = await binance.getTickerPrice('BTCUSDT');
    const stats = await binance.get24hrTicker('BTCUSDT');
    res.json({ exito: true, data: { ...ticker, ...stats } });
  } catch (error) {
    logger.error('chart-api', `GET ticker error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/zones', async (req, res) => {
  try {
    const interval = VALID_INTERVALS.includes(req.query.interval) ? req.query.interval : '1h';
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const type = req.query.type === 'futures' ? 'futures' : 'spot';

    const klines = await binance.getKlines('BTCUSDT', interval, limit, type);
    const ticker = await binance.getTickerPrice('BTCUSDT');
    const result = renkoStrategy.getZones(klines, ticker.price);
    res.json({ exito: true, data: result });
  } catch (error) {
    logger.error('chart-api', `GET zones error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

module.exports = router;
