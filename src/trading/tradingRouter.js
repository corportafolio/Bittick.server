const express = require('express');
const store = require('./tradingStore');
const botManager = require('./botManager');
const logger = require('../logger/logger');

const router = express.Router();

function isVerified(address) {
  if (!address) return false;
  const owner = store.getSelectedInscription(address);
  return !!owner;
}

router.get('/opportunities', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const since = req.query.since || null;
    const address = req.headers['x-wallet-address'];
    if (isVerified(address)) {
      const opportunities = store.getOpportunities(limit, offset, since);
      res.json({ exito: true, data: opportunities, tier: 'premium' });
    } else {
      const opportunities = store.getOpportunitiesFreeTier(limit, offset);
      res.status(300).json({ exito: true, data: opportunities, tier: 'free' });
    }
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
    const address = req.headers['x-wallet-address'];
    if (!isVerified(address)) {
      return res.status(300).json({ exito: true, data: [], tier: 'free' });
    }
    const botType = req.query.type || null;
    const status = req.query.status || 'open';
    const positions = store.getPositions(botType, status, address);
    res.json({ exito: true, data: positions, tier: 'premium' });
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
    const address = req.headers['x-wallet-address'];
    if (!isVerified(address)) {
      return res.status(300).json({
        exito: true,
        data: { spot: { type: 'spot', enabled: false, maxPositions: 0, positionSizeUsdt: 0, minConfidence: 0, openPositions: 0, totalPnl: 0, balance: null }, futures: { type: 'futures', enabled: false, maxPositions: 0, positionSizeUsdt: 0, minConfidence: 0, openPositions: 0, totalPnl: 0, balance: null } },
        tier: 'free'
      });
    }
    const spotStatus = botManager.getBotStatus('spot', address);
    const futuresStatus = botManager.getBotStatus('futures', address);
    const [spotBalance, futuresBalance] = await Promise.all([
      botManager.getBotBalance('spot', address),
      botManager.getBotBalance('futures', address)
    ]);
    spotStatus.balance = spotBalance;
    futuresStatus.balance = futuresBalance;
    res.json({ exito: true, data: { spot: spotStatus, futures: futuresStatus }, tier: 'premium' });
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

// Inscription preferences endpoints (per-inscription bot settings)
router.get('/preferences/:inscriptionId', (req, res) => {
  try {
    const { inscriptionId } = req.params;
    let prefs = store.getInscriptionPreferences(inscriptionId);
    if (!prefs) {
      prefs = {
        inscription_id: inscriptionId,
        spot_enabled: 1,
        futures_enabled: 1,
        spot_position_size: 10.0,
        futures_position_size: 10.0,
        spot_max_positions: 5,
        futures_max_positions: 5,
        spot_min_score: 6,
        futures_min_score: 7
      };
    }
    res.json({ exito: true, data: prefs });
  } catch (error) {
    logger.error('trading-api', `GET preferences error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.post('/preferences', (req, res) => {
  try {
    const { inscriptionId, address, spot_enabled, futures_enabled, spot_position_size, futures_position_size, spot_max_positions, futures_max_positions, spot_min_score, futures_min_score } = req.body;
    if (!inscriptionId || !address) {
      return res.status(400).json({ exito: false, error: 'inscriptionId and address are required' });
    }
    store.upsertInscriptionPreferences(inscriptionId, address, {
      spot_enabled, futures_enabled, spot_position_size, futures_position_size,
      spot_max_positions, futures_max_positions, spot_min_score, futures_min_score
    });
    res.json({ exito: true, message: 'Preferences saved' });
  } catch (error) {
    logger.error('trading-api', `POST preferences error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

// Bot status by inscription (positions opened by a specific inscription)
router.get('/bot/status/:inscriptionId', async (req, res) => {
  try {
    const { inscriptionId } = req.params;
    const openPositions = store.getPositionsByInscription(inscriptionId, 'open');
    const closedPositions = store.getPositionsByInscription(inscriptionId, 'closed');
    res.json({ exito: true, data: { inscriptionId, open: openPositions, closed: closedPositions } });
  } catch (error) {
    logger.error('trading-api', `Bot status by inscription error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

// Bot strategies CRUD
router.get('/strategies/:inscriptionId', (req, res) => {
  try {
    const { inscriptionId } = req.params;
    const strategies = store.getAllBotStrategies(inscriptionId);
    res.json({ exito: true, data: strategies });
  } catch (error) {
    logger.error('trading-api', `GET strategies error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/strategies/:inscriptionId/:mode', (req, res) => {
  try {
    const { inscriptionId, mode } = req.params;
    const strategy = store.getBotStrategy(inscriptionId, mode);
    if (!strategy) {
      return res.json({ exito: true, data: null, message: 'No strategy configured for this mode' });
    }
    res.json({ exito: true, data: strategy });
  } catch (error) {
    logger.error('trading-api', `GET strategy error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.post('/strategies', (req, res) => {
  try {
    const { inscription_id, mode, strategy_name, enabled, parameters,
            position_size_usdt, max_positions, min_confidence, leverage,
            stop_loss_percent, take_profit_percent } = req.body;
    if (!inscription_id || !mode || !strategy_name) {
      return res.status(400).json({ exito: false, error: 'inscription_id, mode, and strategy_name are required' });
    }
    store.saveBotStrategy({
      inscription_id, mode, strategy_name, enabled, parameters,
      position_size_usdt, max_positions, min_confidence, leverage,
      stop_loss_percent, take_profit_percent
    });
    const saved = store.getBotStrategy(inscription_id, mode);
    res.json({ exito: true, data: saved });
  } catch (error) {
    logger.error('trading-api', `POST strategy error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.delete('/strategies/:inscriptionId/:mode', (req, res) => {
  try {
    const { inscriptionId, mode } = req.params;
    store.deleteBotStrategy(inscriptionId, mode);
    res.json({ exito: true, message: `Strategy ${mode} deleted for ${inscriptionId}` });
  } catch (error) {
    logger.error('trading-api', `DELETE strategy error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

module.exports = router;
