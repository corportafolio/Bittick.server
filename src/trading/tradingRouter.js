const express = require('express');
const store = require('./tradingStore');
const botManager = require('./botManager');
const logger = require('../logger/logger');

const router = express.Router();

router.get('/opportunities', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const since = req.query.since || null;
    const opportunities = store.getOpportunities(limit, offset, since);
    res.json({ exito: true, data: opportunities });
  } catch (error) {
    logger.error('trading-api', `GET opportunities error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/opportunities/:id', (req, res) => {
  try {
    const op = store.getOpportunityById(parseInt(req.params.id));
    if (!op) return res.status(404).json({ exito: false, error: 'Opportunity not found' });
    res.json({ exito: true, data: op });
  } catch (error) {
    logger.error('trading-api', `GET opportunity error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.post('/opportunities', (req, res) => {
  try {
    const { asset, strategyType, currentPrice, entryZone, target, stopLoss,
            score, confidence, explanation, factors, risks, signals, horizonte } = req.body;
    if (!asset || !strategyType || currentPrice === undefined) {
      return res.status(400).json({ exito: false, error: 'asset, strategyType, and currentPrice are required' });
    }
    const newOp = {
      asset, strategyType, currentPrice, entryZone, target, stopLoss,
      score: score || 0, confidence: confidence || 0,
      explanation, factors: factors || [], risks: risks || [],
      signals: signals || {}, horizonte: horizonte || 'horas'
    };
    store.insertOpportunity(newOp);
    res.status(201).json({ exito: true, message: 'Opportunity created' });
  } catch (error) {
    logger.error('trading-api', `POST opportunity error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.delete('/opportunities/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = store.deleteOpportunity(id);
    if (!deleted) {
      return res.json({ exito: false, message: 'Oportunidad no encontrada' });
    }
    res.json({ exito: true, message: 'Oportunidad eliminada' });
  } catch (error) {
    logger.error('trading-api', `DELETE opportunity error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/positions', (req, res) => {
  try {
    const botType = req.query.type || null;
    const status = req.query.status || 'open';
    const positions = store.getPositions(botType, status);
    res.json({ exito: true, data: positions });
  } catch (error) {
    logger.error('trading-api', `GET positions error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/positions/:id', (req, res) => {
  try {
    const pos = store.getPositionById(parseInt(req.params.id));
    if (!pos) return res.status(404).json({ exito: false, error: 'Position not found' });
    res.json({ exito: true, data: pos });
  } catch (error) {
    logger.error('trading-api', `GET position error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.post('/positions/:id/cancel', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await botManager.cancelPositionById(id);
    res.json({ exito: true, message: 'Position cancelled', data: result });
  } catch (error) {
    logger.error('trading-api', `Cancel position error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/bot/status', async (req, res) => {
  try {
    const spotStatus = botManager.getBotStatus('spot');
    const futuresStatus = botManager.getBotStatus('futures');
    const [spotBalance, futuresBalance] = await Promise.all([
      botManager.getBotBalance('spot'),
      botManager.getBotBalance('futures')
    ]);
    spotStatus.balance = spotBalance;
    futuresStatus.balance = futuresBalance;
    res.json({ exito: true, data: { spot: spotStatus, futures: futuresStatus } });
  } catch (error) {
    logger.error('trading-api', `Bot status error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/bot/config', (req, res) => {
  try {
    const configs = store.getBotConfigs();
    res.json({ exito: true, data: configs });
  } catch (error) {
    logger.error('trading-api', `Get bot config error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.post('/bot/config', (req, res) => {
  try {
    const { type, enabled, max_positions, position_size_usdt, min_confidence } = req.body;
    if (!type) return res.status(400).json({ exito: false, error: 'type is required' });
    store.updateBotConfig(type, { enabled, max_positions, position_size_usdt, min_confidence });
    const config = store.getBotConfig(type);
    res.json({ exito: true, data: config });
  } catch (error) {
    logger.error('trading-api', `Bot config error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

module.exports = router;
