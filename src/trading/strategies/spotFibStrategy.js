const { calculateRSI } = require('../indicators');
const logger = require('../../logger/logger');

function evaluate(klines, currentPrice) {
  if (!klines || klines.length < 60) return null;

  const lookback = 100;
  const prices = klines.slice(-lookback);
  const closes = prices.map(k => k.close);
  const high = Math.max(...prices.map(k => k.high));
  const low = Math.min(...prices.map(k => k.low));
  const drop = high - low;
  if (drop <= 0) return null;

  const fib618 = high - drop * 0.618;
  const fib786 = high - drop * 0.786;
  const fib500 = low + drop * 0.500;
  const fib382 = low + drop * 0.382;

  const distanceToFib618 = ((currentPrice - fib618) / fib618) * 100;
  const rsiValues = calculateRSI(closes, 14);
  if (!rsiValues || rsiValues.length === 0) return null;
  const currentRSI = rsiValues[rsiValues.length - 1];

  const lastCandle = klines[klines.length - 1];
  const prevCandle = klines[klines.length - 2];
  const isReversal = lastCandle.close > lastCandle.open
    && lastCandle.close > prevCandle.close
    && (lastCandle.low <= fib618 || Math.abs(lastCandle.close - fib618) / fib618 < 0.003);

  if (Math.abs(distanceToFib618) <= 2 && currentRSI <= 35 && isReversal) {
    const score = Math.min(10, Math.max(4, Math.round((6 - Math.abs(distanceToFib618)) + (currentRSI < 25 ? 2 : 0))));
    return {
      strategyType: 'long',
      asset: 'BTCUSDT',
      currentPrice,
      entryZone: `${(fib618 * 0.995).toFixed(1)} - ${(fib618 * 1.005).toFixed(1)}`,
      target: fib500,
      stopLoss: null,
      score,
      rsi: currentRSI,
      fib_level: '61.8%',
      drop_percent: ((drop / high) * 100).toFixed(2),
      signals: {
        type: 'spot_fib_long',
        high: high.toFixed(1), low: low.toFixed(1), dropPercent: ((drop / high) * 100).toFixed(2),
        fib618: fib618.toFixed(1), fib786: fib786.toFixed(1),
        fib500_target: fib500.toFixed(1),
        rsi: currentRSI.toFixed(1), reversal: 'true'
      }
    };
  }

  const distanceToFib786 = ((currentPrice - fib786) / fib786) * 100;
  if (Math.abs(distanceToFib786) <= 2) {
    const score = Math.min(8, Math.max(3, Math.round(6 - Math.abs(distanceToFib786) / 2)));
    return {
      strategyType: 'long',
      asset: 'BTCUSDT',
      currentPrice,
      entryZone: `${(fib786 * 0.995).toFixed(1)} - ${(fib786 * 1.005).toFixed(1)}`,
      target: fib500,
      stopLoss: null,
      score,
      rsi: currentRSI,
      fib_level: '78.6%',
      drop_percent: ((drop / high) * 100).toFixed(2),
      signals: {
        type: 'spot_fib_dca',
        high: high.toFixed(1), low: low.toFixed(1), dropPercent: ((drop / high) * 100).toFixed(2),
        fib618: fib618.toFixed(1), fib786: fib786.toFixed(1),
        fib500_target: fib500.toFixed(1),
        rsi: currentRSI.toFixed(1), reversal: 'false'
      }
    };
  }

  return null;
}

module.exports = { evaluate };
