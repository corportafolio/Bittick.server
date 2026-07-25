const binance = require('./binanceClient');
const logger = require('../logger/logger');

function roundQuantity(botType, qty) {
  const decimals = botType === 'futures' ? 4 : 5;
  const step = botType === 'futures' ? 0.0001 : 0.00001;
  const rounded = Math.floor(qty / step) * step;
  return rounded.toFixed(decimals);
}

async function executeOrder(botType, signal, options = {}) {
  const side = signal.strategyType === 'long' ? 'BUY' : 'SELL';
  const horizonte = signal.horizonte || 'horas';
  const orderType = 'MARKET';

  const usdAmount = options.usdAmount || 10;
  const leverage = options.leverage || 1;
  const leveragedNotional = usdAmount * leverage;
  let orderQuantity = roundQuantity(botType, leveragedNotional / signal.currentPrice);

  const minNotional = botType === 'futures' ? 50 : 5;
  const actualNotional = orderQuantity * signal.currentPrice;
  if (actualNotional < minNotional) {
    logger.warn('execution', `Order too small for ${botType}: $${actualNotional.toFixed(2)} < $${minNotional} minimum, skipping`);
    throw new Error(`Position too small: $${actualNotional.toFixed(2)} notional < $${minNotional} minimum`);
  }

  try {
    if (botType === 'futures') {
      await binance.setLeverage(signal.asset, leverage);
      logger.info('execution', `Futures leverage set to ${leverage}x for ${signal.asset}`);
    }

    logger.info('execution', `Placing ${orderType} ${side} order on ${botType} for $${usdAmount.toFixed(2)} (${orderQuantity} BTC) at ~$${signal.currentPrice} (horizonte: ${horizonte})`);
    const result = await binance.placeOrder(botType, signal.asset, side, orderQuantity.toString(), { type: orderType });
    logger.info('execution', `Order placed: ${JSON.stringify(result)}`);

    const position = {
      botType,
      strategyType: signal.strategyType,
      asset: signal.asset,
      entryPrice: parseFloat(result.fills?.[0]?.price || result.price || signal.currentPrice),
      quantity: parseFloat(result.executedQty || orderQuantity),
      orderId: result.orderId,
      status: 'open',
      entryZone: signal.entryZone,
      target: signal.target,
      stopLoss: signal.stopLoss,
      score: signal.score,
      confidence: signal.confidence,
      explanation: signal.explanation,
      factors: signal.factors,
      risks: signal.risks,
      signals: signal.signals,
      horizonte,
      usdAmount
    };

    return position;
  } catch (error) {
    logger.error('execution', `Order failed on ${botType}: ${error.message}`);
    throw error;
  }
}

async function cancelPosition(botType, asset, orderId) {
  try {
    logger.info('execution', `Cancelling order ${orderId} on ${botType}`);
    const result = await binance.cancelOrder(botType, asset, orderId);
    logger.info('execution', `Order cancelled: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    logger.error('execution', `Cancel failed on ${botType}: ${error.message}`);
    throw error;
  }
}

module.exports = { executeOrder, cancelPosition };
