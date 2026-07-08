const binance = require('./binanceClient');
const store = require('./tradingStore');
const executor = require('./executionEngine');
const logger = require('../logger/logger');

const TIERS = [
  { nivel: 10, percent: 5, leverage: 3 },
  { nivel: 9, percent: 10, leverage: 3 },
  { nivel: 8, percent: 45, leverage: 3 },
  { nivel: 7, percent: 20, leverage: 2 },
  { nivel: 6, percent: 20, leverage: 1 },
];

const BOT_TYPES = ['spot', 'futures'];

function getBotConfig(type) {
  return store.getBotConfig(type) || { type, enabled: 0, max_positions: 5, position_size_usdt: 10, min_confidence: 5 };
}

function getTierConfig(nivel) {
  for (const t of TIERS) {
    if (nivel >= t.nivel) return { percent: t.percent, leverage: t.leverage };
  }
  return null;
}

async function evaluateAndExecute(signal) {
  const results = [];

  const score = Math.round(signal.score || 0);
  const confidence = Math.round(signal.confidence || 0);
  const nivel = Math.min(score, confidence);
  const tier = getTierConfig(nivel);
  if (!tier) {
    logger.info('bot-manager', `Signal score=${score} confidence=${confidence} (nivel=${nivel}) too low, skipping`);
    return results;
  }

  for (const botType of BOT_TYPES) {
    const config = getBotConfig(botType);
    if (!config.enabled) continue;

    if (botType === 'spot' && signal.strategyType !== 'long') continue;

    const openPositions = store.getPositions(botType, 'open');
    if (openPositions.length >= config.max_positions) {
      logger.info('bot-manager', `${botType} bot: max positions (${config.max_positions}) reached, skipping`);
      continue;
    }

    const budgetKey = botType === 'spot' ? 'BOT_SPOT_BUDGET' : 'BOT_FUTURES_BUDGET';
    const budget = parseFloat(process.env[budgetKey] || '100');
    const usdAmount = (budget * tier.percent) / 100;

    try {
      const position = await executor.executeOrder(botType, signal, { usdAmount, leverage: tier.leverage });
      position.confidence = signal.confidence;
      position.factors = signal.factors;
      position.risks = signal.risks;
      position.signals = signal.signals;
      position.usdAmount = usdAmount;
      const id = store.insertPosition(position);
      logger.info('bot-manager', `${botType} bot opened position #${id}: $${usdAmount} (${tier.percent}%, nivel=${nivel}) ${signal.strategyType.toUpperCase()} ${signal.asset} at $${signal.currentPrice}`);
      results.push({ ...position, id });
    } catch (error) {
      logger.error('bot-manager', `${botType} bot execution error: ${error.message}`);
    }
  }

  return results;
}

async function cancelPositionById(id) {
  const position = store.getPositionById(id);
  if (!position) throw new Error(`Position #${id} not found`);
  if (position.status !== 'open') throw new Error(`Position #${id} is already ${position.status}`);

  if (position.order_id) {
    await executor.cancelPosition(position.bot_type, position.asset, position.order_id);
  }

  store.cancelPosition(id);

  const ticker = await binance.getTickerPrice(position.asset, position.bot_type);
  const entry = position.entry_price;
  const current = ticker.price;
  const pnlAmount = position.strategy_type === 'long'
    ? (current - entry) * position.quantity
    : (entry - current) * position.quantity;
  const pnlPercent = ((pnlAmount / (entry * position.quantity)) * 100);

  const pnl = { pnl: parseFloat(pnlAmount.toFixed(2)), pnlPercent: parseFloat(pnlPercent.toFixed(2)) };
  store.closePosition(id, current, pnl);

  logger.info('bot-manager', `Position #${id} cancelled. PnL: $${pnl.pnl} (${pnl.pnlPercent}%)`);

  return { ...position, status: 'cancelled', current_price: current, pnl: pnl.pnl, pnl_percent: pnl.pnlPercent };
}

async function monitorPositions() {
  for (const botType of BOT_TYPES) {
    const config = getBotConfig(botType);
    if (!config.enabled) continue;

    const positions = store.getPositions(botType, 'open');
    if (positions.length === 0) continue;

    try {
      const ticker = await binance.getTickerPrice('BTCUSDT', botType);
      const currentPrice = ticker.price;

      for (const pos of positions) {
        const entry = pos.entry_price;
        const pnlAmount = pos.strategy_type === 'long'
          ? (currentPrice - entry) * pos.quantity
          : (entry - currentPrice) * pos.quantity;
        const pnlPercent = ((pnlAmount / (entry * pos.quantity)) * 100);
        const pnl = { pnl: parseFloat(pnlAmount.toFixed(2)), pnlPercent: parseFloat(pnlPercent.toFixed(2)) };

        store.updatePositionPrice(pos.id, currentPrice, pnl);

        let shouldClose = false;
        let closeReason = '';

        if (pos.target && pos.strategy_type === 'long' && currentPrice >= pos.target && currentPrice <= pos.target * 1.02) {
          shouldClose = true;
          closeReason = 'take profit';
        } else if (pos.target && pos.strategy_type === 'short' && currentPrice <= pos.target && currentPrice >= pos.target * 0.98) {
          shouldClose = true;
          closeReason = 'take profit';
        } else if (pos.stop_loss && pos.strategy_type === 'long' && currentPrice <= pos.stop_loss) {
          shouldClose = true;
          closeReason = 'stop loss';
        } else if (pos.stop_loss && pos.strategy_type === 'short' && currentPrice >= pos.stop_loss) {
          shouldClose = true;
          closeReason = 'stop loss';
        }

        if (shouldClose) {
          if (pos.bot_type === 'spot' && pos.quantity > 0) {
            try {
              const sellQty = pos.quantity.toFixed(6);
              logger.info('bot-manager', `Spot: placing SELL order for ${sellQty} ${pos.asset}`);
              await binance.placeOrder('spot', pos.asset, 'SELL', sellQty);
              logger.info('bot-manager', `Spot: SELL executed at ~$${currentPrice}`);
            } catch (sellError) {
              logger.error('bot-manager', `Spot sell failed: ${sellError.message}`);
            }
          } else if (pos.order_id) {
            await executor.cancelPosition(botType, pos.asset, pos.order_id);
          }
          store.closePosition(pos.id, currentPrice, pnl);
          logger.info('bot-manager', `Position #${pos.id} closed via ${closeReason}. PnL: $${pnl.pnl} (${pnl.pnlPercent}%)`);
        }
      }
    } catch (error) {
      logger.error('bot-manager', `Monitor error for ${botType}: ${error.message}`);
    }
  }
}

function getBotStatus(type) {
  const config = getBotConfig(type);
  const positions = store.getPositions(type, 'open');
  const stats = store.getBotStats(type);
  return {
    type,
    enabled: !!config.enabled,
    maxPositions: config.max_positions,
    positionSizeUsdt: config.position_size_usdt,
    minConfidence: config.min_confidence,
    openPositions: positions.length,
    totalPnl: stats.totalPnl,
    balance: null
  };
}

async function getBotBalance(type) {
  try {
    const budgetKey = type === 'spot' ? 'BOT_SPOT_BUDGET' : 'BOT_FUTURES_BUDGET';
    const budget = parseFloat(process.env[budgetKey] || '100');
    const openPositions = store.getPositions(type, 'open');
    const usedInPositions = openPositions.reduce((sum, p) => sum + parseFloat(p.usd_amount || 0), 0);
    const available = Math.max(0, budget - usedInPositions);
    return {
      total: parseFloat(budget.toFixed(2)),
      available: parseFloat(available.toFixed(2))
    };
  } catch (error) {
    logger.error('bot-manager', `Balance error for ${type}: ${error.message}`);
    return { total: 0, available: 0 };
  }
}

module.exports = { evaluateAndExecute, cancelPositionById, monitorPositions, getBotStatus, getBotBalance };
