const express = require('express');
const store = require('./tradingStore');
const pool = require('../engine/poolStore');
const botManager = require('./botManager');
const logger = require('../logger/logger');

const router = express.Router();

function isVerified(address) {
  if (!address) return false;
  const owner = pool.getSelectedInscription(address);
  return !!owner;
}

router.get('/opportunities', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const since = req.query.since || null;
    const botType = req.query.bot_type || null;
    const address = req.headers['x-wallet-address'];
    if (isVerified(address)) {
      const opportunities = store.getOpportunities(limit, offset, since, botType);
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
    const inscriptionId = req.query.inscription_id || null;
    const includeClosed = req.query.include_closed === "true";
    let positions;
    if (inscriptionId) {
      positions = store.getPositionsByInscription(inscriptionId, status, includeClosed);
    } else {
      positions = store.getPositions(botType, status, address, includeClosed);
    }
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

router.post('/positions/:id/close', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await botManager.closePositionById(id);
    res.json({ exito: true, message: 'Position closed', data: result });
  } catch (error) {
    logger.error('trading-api', `Close position error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.post('/positions/close', async (req, res) => {
  try {
    const address = req.headers['x-wallet-address'];
    const inscriptionId = req.body.inscriptionId || null;
    const closed = await botManager.closeAllOpenPositions(address, inscriptionId);
    res.json({ exito: true, message: 'All open positions closed', data: { closed } });
  } catch (error) {
    logger.error('trading-api', `Close all positions error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.post('/positions/dismiss', async (req, res) => {
  try {
    const { positionId } = req.body;
    if (!positionId) return res.status(400).json({ exito: false, error: 'positionId required' });
    store.cancelPosition(parseInt(positionId));
    res.json({ exito: true, message: 'Position dismissed' });
  } catch (error) {
    logger.error('trading-api', `Dismiss position error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/bot/status', async (req, res) => {
  try {
    const address = req.headers['x-wallet-address'];
    if (!isVerified(address)) {
      return res.status(300).json({
        exito: true,
        data: { spot: { type: 'spot', enabled: false, hasApiKey: false, maxPositions: 0, positionSizeUsdt: 0, minConfidence: 0, openPositions: 0, totalPnl: 0, balance: null }, futures: { type: 'futures', enabled: false, hasApiKey: false, maxPositions: 0, positionSizeUsdt: 0, minConfidence: 0, openPositions: 0, totalPnl: 0, balance: null } },
        tier: 'free'
      });
    }
    const inscriptionId = req.query.inscriptionId || null;
    const spotStatus = botManager.getBotStatus('spot', address, inscriptionId);
    const futuresStatus = botManager.getBotStatus('futures', address, inscriptionId);
    const [spotBalance, futuresBalance] = await Promise.all([
      botManager.getBotBalance('spot', address, inscriptionId),
      botManager.getBotBalance('futures', address, inscriptionId)
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
    let prefs = pool.getInscriptionPreferences(inscriptionId);
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
        futures_min_score: 7,
        language: 'es'
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
    const { inscriptionId, address, spot_enabled, futures_enabled, spot_position_size, futures_position_size, spot_max_positions, futures_max_positions, spot_min_score, futures_min_score, language } = req.body;
    if (!inscriptionId || !address) {
      return res.status(400).json({ exito: false, error: 'inscriptionId and address are required' });
    }
    pool.upsertInscriptionPreferences(inscriptionId, address, {
      spot_enabled, futures_enabled, spot_position_size, futures_position_size,
      spot_max_positions, futures_max_positions, spot_min_score, futures_min_score,
      language
    });
    res.json({ exito: true, message: 'Preferences saved' });
  } catch (error) {
    logger.error('trading-api', `POST preferences error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.post('/budget', (req, res) => {
  try {
    const { inscriptionId, mode, budget } = req.body;
    if (!inscriptionId || !mode || budget === undefined) {
      return res.status(400).json({ exito: false, error: 'inscriptionId, mode, and budget are required' });
    }
    pool.updateInscriptionBudget(inscriptionId, mode, parseFloat(budget));
    res.json({ exito: true, message: 'Budget saved' });
  } catch (error) {
    logger.error('trading-api', `POST budget error: ${error.message}`);
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

// Bot strategies per-level CRUD
router.get('/strategies/:inscriptionId', (req, res) => {
  try {
    const { inscriptionId } = req.params;
    const spotLevels = pool.getBotStrategiesByLevel(inscriptionId, 'spot');
    const futuresLevels = pool.getBotStrategiesByLevel(inscriptionId, 'futures');
    const all = spotLevels.concat(futuresLevels);
    res.json({ exito: true, data: all });
  } catch (error) {
    logger.error('trading-api', `GET strategies error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/strategies/levels/:inscriptionId/:mode', (req, res) => {
  try {
    const { inscriptionId, mode } = req.params;
    let levels = pool.getBotStrategiesByLevel(inscriptionId, mode);
    if (!levels || levels.length === 0) {
      const isSpot = mode === 'spot';
      levels = [
        { level: 10, enabled: 1, position_size_usdt: 10, min_score: 10, min_confidence: 10, leverage: 10 },
        { level: 9,  enabled: 1, position_size_usdt: 20, min_score: 9,  min_confidence: 9,  leverage: 10 },
        { level: 8,  enabled: 1, position_size_usdt: 40, min_score: 8,  min_confidence: 8,  leverage: 10 },
        { level: 7,  enabled: 1, position_size_usdt: 20, min_score: 7,  min_confidence: 7,  leverage: 5  },
        { level: 6,  enabled: 1, position_size_usdt: 10, min_score: isSpot ? 7 : 8, min_confidence: 6, leverage: 3 },
        { level: 5,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
        { level: 4,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
        { level: 3,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
        { level: 2,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
        { level: 1,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 }
      ];
    }
    res.json({ exito: true, data: levels });
  } catch (error) {
    logger.error('trading-api', `GET strategies/levels error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/strategies/levels/:inscriptionId', (req, res) => {
  try {
    const { inscriptionId } = req.params;
    const spotLevels = pool.getBotStrategiesByLevel(inscriptionId, 'spot');
    const futuresLevels = pool.getBotStrategiesByLevel(inscriptionId, 'futures');
    
    const spotDefaults = [
      { level: 10, enabled: 1, position_size_usdt: 10, min_score: 10, min_confidence: 10, leverage: 10 },
      { level: 9,  enabled: 1, position_size_usdt: 20, min_score: 9,  min_confidence: 9,  leverage: 10 },
      { level: 8,  enabled: 1, position_size_usdt: 40, min_score: 8,  min_confidence: 8,  leverage: 10 },
      { level: 7,  enabled: 1, position_size_usdt: 20, min_score: 7,  min_confidence: 7,  leverage: 5  },
      { level: 6,  enabled: 1, position_size_usdt: 10, min_score: 7,  min_confidence: 6,  leverage: 3  },
      { level: 5,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
      { level: 4,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
      { level: 3,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
      { level: 2,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
      { level: 1,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 }
    ];
    
    const futuresDefaults = [
      { level: 10, enabled: 1, position_size_usdt: 10, min_score: 10, min_confidence: 10, leverage: 10 },
      { level: 9,  enabled: 1, position_size_usdt: 20, min_score: 9,  min_confidence: 9,  leverage: 10 },
      { level: 8,  enabled: 1, position_size_usdt: 40, min_score: 8,  min_confidence: 8,  leverage: 10 },
      { level: 7,  enabled: 1, position_size_usdt: 20, min_score: 7,  min_confidence: 7,  leverage: 5  },
      { level: 6,  enabled: 1, position_size_usdt: 10, min_score: 8,  min_confidence: 6,  leverage: 3  },
      { level: 5,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
      { level: 4,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
      { level: 3,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
      { level: 2,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
      { level: 1,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 }
    ];
    
    const spot = (spotLevels && spotLevels.length > 0) ? spotLevels : spotDefaults;
    const futures = (futuresLevels && futuresLevels.length > 0) ? futuresLevels : futuresDefaults;
    
    res.json({ exito: true, data: { spot, futures } });
  } catch (error) {
    logger.error('trading-api', `GET strategies/levels (both) error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.post('/strategies/levels', (req, res) => {
  try {
    const { inscription_id, mode, levels } = req.body;
    if (!inscription_id || !mode || !levels || !Array.isArray(levels)) {
      return res.status(400).json({ exito: false, error: 'inscription_id, mode, and levels array are required' });
    }
    pool.saveBotStrategiesByLevel(inscription_id, mode, levels);
    const saved = pool.getBotStrategiesByLevel(inscription_id, mode);
    res.json({ exito: true, data: saved });
  } catch (error) {
    logger.error('trading-api', `POST strategies/levels error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.delete('/strategies/levels/:inscriptionId/:mode', (req, res) => {
  try {
    const { inscriptionId, mode } = req.params;
    pool.deleteBotStrategiesByLevel(inscriptionId, mode);
    res.json({ exito: true, message: `Strategies ${mode} levels deleted for ${inscriptionId}` });
  } catch (error) {
    logger.error('trading-api', `DELETE strategies/levels error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

// Bot API Key endpoints (per-bot per-mode Binance credentials)
router.get('/bot-apikey/:inscriptionId/status', (req, res) => {
  try {
    const { inscriptionId } = req.params;
    const spot = pool.getBotApiKey(inscriptionId, 'spot');
    const futures = pool.getBotApiKey(inscriptionId, 'futures');
    res.json({
      exito: true,
      data: {
        spot_api_key: spot != null && spot.api_key != null && spot.api_key.length > 0,
        spot_api_secret: spot != null && spot.api_secret != null && spot.api_secret.length > 0,
        futures_api_key: futures != null && futures.api_key != null && futures.api_key.length > 0,
        futures_api_secret: futures != null && futures.api_secret != null && futures.api_secret.length > 0
      }
    });
  } catch (error) {
    logger.error('trading-api', `GET bot-apikey/status error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/bot-apikey/:inscriptionId/:mode', (req, res) => {
  try {
    const { inscriptionId, mode } = req.params;
    const key = pool.getBotApiKey(inscriptionId, mode);
    if (!key) {
      return res.json({ exito: true, data: null });
    }
    const maskedKey = key.api_key.length > 8
      ? key.api_key.substring(0, 4) + '••••••••' + key.api_key.substring(key.api_key.length - 4)
      : '••••••••';
    const maskedSecret = '•••••••••••••••••••';
    res.json({ exito: true, data: { api_key: maskedKey, api_secret: maskedSecret, has_key: true } });
  } catch (error) {
    logger.error('trading-api', `GET bot-apikey error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.get('/bot-apikey/:inscriptionId/:mode/raw', (req, res) => {
  try {
    const address = req.headers['x-wallet-address'];
    if (!isVerified(address)) {
      return res.status(403).json({ exito: false, error: 'Unauthorized' });
    }
    const { inscriptionId, mode } = req.params;
    const key = pool.getBotApiKey(inscriptionId, mode);
    if (!key) {
      return res.json({ exito: true, data: null });
    }
    res.json({ exito: true, data: { ...key, has_key: true } });
  } catch (error) {
    logger.error('trading-api', `GET bot-apikey/raw error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.post('/bot-apikey/all', (req, res) => {
  try {
    const address = req.headers['x-wallet-address'];
    if (!isVerified(address)) {
      return res.status(403).json({ exito: false, error: 'Unauthorized' });
    }
    const { inscription_id, spot_key, spot_secret, futures_key, futures_secret } = req.body;
    if (!inscription_id) {
      return res.status(400).json({ exito: false, error: 'inscription_id is required' });
    }
    if (spot_key && spot_secret) {
      pool.saveBotApiKey(inscription_id, 'spot', address, spot_key, spot_secret);
    }
    if (futures_key && futures_secret) {
      pool.saveBotApiKey(inscription_id, 'futures', address, futures_key, futures_secret);
    }
    res.json({ exito: true, message: 'API keys saved' });
  } catch (error) {
    logger.error('trading-api', `POST bot-apikey/all error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.post('/bot-apikey', (req, res) => {
  try {
    const address = req.headers['x-wallet-address'];
    if (!isVerified(address)) {
      return res.status(403).json({ exito: false, error: 'Unauthorized' });
    }
    const { inscription_id, mode, api_key, api_secret } = req.body;
    if (!inscription_id || !mode || !api_key || !api_secret) {
      return res.status(400).json({ exito: false, error: 'inscription_id, mode, api_key, and api_secret are required' });
    }
    pool.saveBotApiKey(inscription_id, mode, address, api_key, api_secret);
    res.json({ exito: true, message: 'API key saved' });
  } catch (error) {
    logger.error('trading-api', `POST bot-apikey error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

router.delete('/bot-apikey/:inscriptionId/:mode', (req, res) => {
  try {
    const address = req.headers['x-wallet-address'];
    if (!isVerified(address)) {
      return res.status(403).json({ exito: false, error: 'Unauthorized' });
    }
    const { inscriptionId, mode } = req.params;
    pool.deleteBotApiKey(inscriptionId, mode);
    res.json({ exito: true, message: 'API key deleted' });
  } catch (error) {
    logger.error('trading-api', `DELETE bot-apikey error: ${error.message}`);
    res.status(500).json({ exito: false, error: error.message });
  }
});

module.exports = router;
