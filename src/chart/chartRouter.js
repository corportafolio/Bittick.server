const express = require('express');
const binance = require('../trading/binanceClient');
const renkoStrategy = require('../trading/strategies/renkoAccumulationStrategy');
const store = require('../trading/tradingStore');
const logger = require('../logger/logger');

const router = express.Router();

const VALID_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];

/* === KLINE CACHE === */
const cache = new Map();
const CACHE_TTL = 60000;

async function getCachedKlines(interval, limit, type) {
  const key = interval + '_' + type;
  const cached = cache.get(key);
  const now = Date.now();

  if (cached && (now - cached.lastUpdate) < CACHE_TTL) {
    return cached.klines.slice(-limit);
  }

  const klines = await binance.getKlines('BTCUSDT', interval, 1000, type);
  cache.set(key, { klines: klines, lastUpdate: now });
  return klines.slice(-limit);
}

async function refreshLatestKlines() {
  for (const interval of VALID_INTERVALS) {
    try {
      const key = interval + '_spot';
      const cached = cache.get(key);
      const fresh = await binance.getKlines('BTCUSDT', interval, 5, 'spot');

      if (!cached || !cached.klines.length) {
        cache.set(key, { klines: fresh, lastUpdate: Date.now() });
        continue;
      }

      const lastCached = cached.klines[cached.klines.length - 1];
      const newKlines = fresh.filter(function(f) { return f.openTime > lastCached.openTime; });

      if (newKlines.length === 0) {
        Object.assign(lastCached, fresh[fresh.length - 1]);
      } else {
        cached.klines = cached.klines.concat(newKlines);
        if (cached.klines.length > 1000) {
          cached.klines = cached.klines.slice(-1000);
        }
      }
      cached.lastUpdate = Date.now();
    } catch (e) {
      logger.error('kline-cache', 'Refresh ' + interval + ' error: ' + e.message);
    }
  }
}

let bgInterval = null;
function startBackgroundRefresh() {
  if (bgInterval) return;
  refreshLatestKlines();
  bgInterval = setInterval(refreshLatestKlines, 60000);
  logger.info('kline-cache', 'Background refresh started (60s)');
}

/* === ROUTES === */

router.get('/klines', async (req, res) => {
  try {
    const interval = VALID_INTERVALS.includes(req.query.interval) ? req.query.interval : '1h';
    const limit = Math.min(parseInt(req.query.limit) || 500, 1000);
    const type = req.query.type === 'futures' ? 'futures' : 'spot';
    const klines = await getCachedKlines(interval, limit, type);
    res.json({ exito: true, data: klines });
  } catch (error) {
    logger.error('chart-api', 'GET klines error: ' + error.message);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/ticker', async (req, res) => {
  try {
    const ticker = await binance.getTickerPrice('BTCUSDT');
    const stats = await binance.get24hrTicker('BTCUSDT');
    res.json({ exito: true, data: Object.assign({}, ticker, stats) });
  } catch (error) {
    logger.error('chart-api', 'GET ticker error: ' + error.message);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/zones', async (req, res) => {
  try {
    const type = req.query.type === 'futures' ? 'futures' : 'spot';
    const klines = await binance.getKlines('BTCUSDT', '1h', 500, type);
    const ticker = await binance.getTickerPrice('BTCUSDT');
    const result = renkoStrategy.getZones(klines, ticker.price);
    res.json({ exito: true, data: result });
  } catch (error) {
    logger.error('chart-api', 'GET zones error: ' + error.message);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/trading-zones', (req, res) => {
  try {
    const price = parseFloat(req.query.price) || null;
    const zones = price ? store.getSmartZones(price) : store.getTradingZones(100);
    res.json({ exito: true, data: zones });
  } catch (error) {
    logger.error('chart-api', 'GET trading-zones error: ' + error.message);
    res.status(500).json({ exito: false, error: error.message });
  }
});

startBackgroundRefresh();

module.exports = router;
