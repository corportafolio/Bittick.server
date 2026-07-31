const binance = require("./binanceClient");
const store = require("./tradingStore");
const pool = require("../engine/poolStore");
const executor = require("./executionEngine");
const logger = require("../logger/logger");

const TIERS = [
  { nivel: 10, percent: 10, leverage: 3 },
  { nivel: 9, percent: 20, leverage: 3 },
  { nivel: 8, percent: 40, leverage: 3 },
  { nivel: 7, percent: 20, leverage: 2 },
  { nivel: 6, percent: 10, leverage: 1 },
];

const BOT_TYPES = ["spot", "futures"];

function getBotConfig(type) {
  return store.getBotConfig(type) || { type, enabled: 0, max_positions: 10, position_size_usdt: 10, min_confidence: 6 };
}

function getTierConfig(nivel) {
  for (const t of TIERS) {
    if (nivel >= t.nivel) return { percent: t.percent, leverage: t.leverage };
  }
  return null;
}

async function evaluateAndExecute(signal, context = {}) {
  const results = [];

  const score = Math.round(signal.score || 0);
  const confidence = Math.round(signal.confidence || 0);
  const nivel = Math.min(score, confidence);

  if (nivel < 6) {
    logger.info("bot-manager", `Signal score=${score} confidence=${confidence} (nivel=${nivel}) below minimum, skipping`);
    return results;
  }

  const targetBotType = signal.botType || "futures";
  const botTypes = targetBotType === "spot" ? ["spot"] : ["futures"];

  for (const botType of botTypes) {
    const config = getBotConfig(botType);
    if (!config.enabled) continue;

    if (botType === "spot" && signal.strategyType !== "long") continue;

    let usdAmount = null;
    let leverage = 1;
    let levelEnabled = true;

    if (context.inscriptionId) {
      const levelConfig = pool.getBotStrategyByLevel(context.inscriptionId, botType, nivel);
      if (levelConfig) {
        levelEnabled = !!levelConfig.enabled;
        usdAmount = levelConfig.position_size_usdt;
        leverage = levelConfig.leverage || 1;
        if (levelConfig.min_score && score < levelConfig.min_score) {
          logger.info("bot-manager", `${botType} bot: score ${score} < min_score ${levelConfig.min_score} for level ${nivel}, skipping`);
          continue;
        }
        if (levelConfig.min_confidence && confidence < levelConfig.min_confidence) {
          logger.info("bot-manager", `${botType} bot: confidence ${confidence} < min_confidence ${levelConfig.min_confidence} for level ${nivel}, skipping`);
          continue;
        }
      }
    }

    if (!levelEnabled) {
      logger.info("bot-manager", `${botType} bot: nivel ${nivel} disabled for inscription, skipping`);
      continue;
    }

    if (confidence < config.min_confidence) {
      logger.info("bot-manager", `${botType} bot: confidence ${confidence} < min ${config.min_confidence}, skipping`);
      continue;
    }

    const openPositions = store.getPositionsByInscription(context.inscriptionId, "open").filter(function(p) { return p.bot_type === botType; });
    if (openPositions.length >= config.max_positions) {
      logger.info("bot-manager", `${botType} bot: max positions (${config.max_positions}) reached for inscription ${context.inscriptionId}, skipping`);
      continue;
    }

    const alreadyOpen = openPositions.some(p => p.level === nivel);
    if (alreadyOpen) {
      logger.info("bot-manager", `${botType} bot: already open position on ${signal.asset} ${signal.strategyType} for inscription ${context.inscriptionId}, skipping`);
      continue;
    }

    if (!usdAmount) {
      const tierFallback = getTierConfig(nivel);
      if (!tierFallback) continue;
      const budgetKey = botType === "spot" ? "BOT_SPOT_BUDGET" : "BOT_FUTURES_BUDGET";
      const budget = parseFloat(process.env[budgetKey] || "100");
      usdAmount = (budget * tierFallback.percent) / 100;
      leverage = tierFallback.leverage;
    }

    if (context.inscriptionId) {
      const apiKey = pool.getBotApiKey(context.inscriptionId, botType);
      if (!apiKey) {
        logger.info("bot-manager", `${botType} bot for inscription ${context.inscriptionId} has no API key, skipping execution`);
        continue;
      }
    }

    try {
      const position = await executor.executeOrder(botType, signal, { usdAmount, leverage }, nivel);
      position.confidence = signal.confidence;
      position.factors = signal.factors;
      position.risks = signal.risks;
      position.signals = signal.signals;
      position.usdAmount = usdAmount;
      position.opportunity_id = signal.id;
      position.inscriptionId = context.inscriptionId || null;
      position.address = context.address || null;
      position.leverage = leverage;
      position.level = nivel;
      const id = store.insertPosition(position);
      logger.info("bot-manager", `${botType} bot opened position #${id}: $${usdAmount} (nivel=${nivel}) ${signal.strategyType.toUpperCase()} ${signal.asset} at $${signal.currentPrice} | bot=${context.botNum || "?"} addr=${context.address || "global"}`);
      results.push({ ...position, id });
    } catch (error) {
      logger.error("bot-manager", `${botType} bot execution error: ${error.message}`);
    }
  }

  return results;
}

async function cancelPositionById(id) {
  const position = store.getPositionById(id);
  if (!position) throw new Error(`Position #${id} not found`);
  if (position.status !== "open") throw new Error(`Position #${id} is already ${position.status}`);

  if (position.order_id) {
    await executor.cancelPosition(position.bot_type, position.asset, position.order_id);
  }

  store.cancelPosition(id);

  const ticker = await binance.getTickerPrice(position.asset, position.bot_type);
  const entry = position.entry_price;
  const current = ticker.price;
  const pnlAmount = position.strategy_type === "long"
    ? (current - entry) * position.quantity
    : (entry - current) * position.quantity;
  const pnlPercent = ((pnlAmount / (entry * position.quantity)) * 100);

  const pnl = { pnl: parseFloat(pnlAmount.toFixed(2)), pnlPercent: parseFloat(pnlPercent.toFixed(2)) };
  store.closePosition(id, current, pnl, "manual");

  logger.info("bot-manager", `Position #${id} cancelled. PnL: $${pnl.pnl} (${pnl.pnlPercent}%)`);

  return { ...position, status: "cancelled", current_price: current, pnl: pnl.pnl, pnl_percent: pnl.pnlPercent };
}

async function monitorPositions() {
  const allOpenPositions = store.getPositions(null, "open");
  if (allOpenPositions.length > 0) {
    try {
      const [spotTicker, futuresTicker] = await Promise.all([
        binance.getTickerPrice("BTCUSDT", "spot"),
        binance.getTickerPrice("BTCUSDT", "futures")
      ]);
      const spotPrice = spotTicker.price;
      const futuresPrice = futuresTicker.price;

      for (const pos of allOpenPositions) {
        const currentPrice = pos.bot_type === "spot" ? spotPrice : futuresPrice;
        
        const entry = pos.entry_price || currentPrice;
        const quantity = pos.quantity && pos.quantity > 0 ? pos.quantity
          : (pos.usd_amount && entry > 0 ? pos.usd_amount / entry : 0);
        const pnlAmount = pos.strategy_type === "long"
          ? (currentPrice - entry) * quantity
          : (entry - currentPrice) * quantity;
        const pnlPercent = (entry > 0 && quantity > 0) ? ((pnlAmount / (entry * quantity)) * 100) : 0;
        const pnl = { pnl: parseFloat(pnlAmount.toFixed(2)), pnlPercent: parseFloat(pnlPercent.toFixed(2)) };

        store.updatePositionPrice(pos.id, currentPrice, pnl);
      }
    } catch (error) {
      logger.error("bot-manager", `Price sync error: ${error.message}`);
    }
  }

  for (const botType of BOT_TYPES) {
    const config = getBotConfig(botType);
    if (!config.enabled) continue;

    const positions = store.getPositions(botType, "open");
    if (positions.length === 0) continue;

    try {
      const ticker = await binance.getTickerPrice("BTCUSDT", botType);
      const currentPrice = ticker.price;

      for (const pos of positions) {
        const entry = pos.entry_price;
        const quantity = pos.quantity && pos.quantity > 0 ? pos.quantity
          : (pos.usd_amount && entry > 0 ? pos.usd_amount / entry : 0);
        const pnlAmount = pos.strategy_type === "long"
          ? (currentPrice - entry) * quantity
          : (entry - currentPrice) * quantity;
        const pnlPercent = (entry > 0 && quantity > 0) ? ((pnlAmount / (entry * quantity)) * 100) : 0;
        const pnl = { pnl: parseFloat(pnlAmount.toFixed(2)), pnlPercent: parseFloat(pnlPercent.toFixed(2)) };

        store.updatePositionPrice(pos.id, currentPrice, pnl);

        let shouldClose = false;
        let closeReason = "";

        if (pos.target && pos.strategy_type === "long" && currentPrice >= pos.target && currentPrice <= pos.target * 1.02) {
          shouldClose = true;
          closeReason = "take profit";
        } else if (pos.target && pos.strategy_type === "short" && currentPrice <= pos.target && currentPrice >= pos.target * 0.98) {
          shouldClose = true;
          closeReason = "take profit";
        } else if (pos.stop_loss && pos.strategy_type === "long" && currentPrice <= pos.stop_loss) {
          shouldClose = true;
          closeReason = "stop loss";
        } else if (pos.stop_loss && pos.strategy_type === "short" && currentPrice >= pos.stop_loss) {
          shouldClose = true;
          closeReason = "stop loss";
        }

        if (shouldClose) {
          if (pos.bot_type === "spot" && pos.quantity > 0) {
            try {
              const sellQty = pos.quantity.toFixed(6);
              logger.info("bot-manager", `Spot: placing SELL order for ${sellQty} ${pos.asset}`);
              await binance.placeOrder("spot", pos.asset, "SELL", sellQty);
              logger.info("bot-manager", `Spot: SELL executed at ~$${currentPrice}`);
            } catch (sellError) {
              logger.error("bot-manager", `Spot sell failed: ${sellError.message}`);
            }
          } else if (pos.order_id) {
            await executor.cancelPosition(botType, pos.asset, pos.order_id);
          }
          store.closePosition(pos.id, currentPrice, pnl, closeReason);
          logger.info("bot-manager", `Position #${pos.id} closed via ${closeReason}. PnL: $${pnl.pnl} (${pnl.pnlPercent}%)`);
        }
      }
    } catch (error) {
      logger.error("bot-manager", `Monitor error for ${botType}: ${error.message}`);
    }
  }
}

function getBotStatus(type, address = null, inscriptionId = null) {
  const config = getBotConfig(type);
  const positions = store.getPositions(type, "open", address);
  const stats = store.getBotStats(type);
  let hasApiKey = false;
  if (inscriptionId) {
    const apiKey = pool.getBotApiKey(inscriptionId, type);
    hasApiKey = !!apiKey;
  }
  return {
    type,
    enabled: !!config.enabled,
    hasApiKey,
    maxPositions: config.max_positions,
    positionSizeUsdt: config.position_size_usdt,
    minConfidence: config.min_confidence,
    openPositions: positions.length,
    totalPnl: stats.totalPnl,
    balance: null
  };
}

async function getBotBalance(type, address = null, inscriptionId = null) {
  try {
    let budget;
    if (inscriptionId) {
      const prefs = pool.getInscriptionPreferences(inscriptionId);
      budget = type === "spot" ? (prefs?.spot_budget || 100) : (prefs?.futures_budget || 200);
    } else {
      const budgetKey = type === "spot" ? "BOT_SPOT_BUDGET" : "BOT_FUTURES_BUDGET";
      budget = parseFloat(process.env[budgetKey] || (type === "spot" ? "100" : "200"));
    }

    const stats = store.getBotStats(type);
    const realizedPnl = stats.totalPnl || 0;

    const openPositions = store.getPositions(type, "open", address);
    const usedInPositions = openPositions.reduce((sum, p) => sum + parseFloat(p.usd_amount || 0), 0);

    const total = budget + realizedPnl;
    const available = Math.max(0, total - usedInPositions);

    return {
      total: parseFloat(total.toFixed(2)),
      available: parseFloat(available.toFixed(2))
    };
  } catch (error) {
    logger.error("bot-manager", `Balance error for ${type}: ${error.message}`);
    return { total: 0, available: 0 };
  }
}

module.exports = { evaluateAndExecute, cancelPositionById, monitorPositions, getBotStatus, getBotBalance };
