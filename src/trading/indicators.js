const { RSI, SMA, EMA } = require('technicalindicators');

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  return RSI.calculate({ values: closes, period });
}

function calculateSMA(values, period = 20) {
  if (values.length < period) return null;
  const result = SMA.calculate({ values, period });
  return result[result.length - 1];
}

function calculateEMA(values, period = 20) {
  if (values.length < period) return null;
  const result = EMA.calculate({ values, period });
  return result[result.length - 1];
}

function calculateFibRetracement(high, low) {
  const diff = high - low;
  return {
    level0: high,
    level236: high - diff * 0.236,
    level382: high - diff * 0.382,
    level500: high - diff * 0.5,
    level618: high - diff * 0.618,
    level786: high - diff * 0.786,
    level100: low
  };
}

function findRecentHighLow(klines, lookback = 50) {
  const slice = klines.slice(-lookback);
  let high = -Infinity, low = Infinity;
  for (const k of slice) {
    if (k.high > high) high = k.high;
    if (k.low < low) low = k.low;
  }
  return { high, low };
}

function detectGap(currentOpen, previousClose) {
  if (previousClose === 0) return null;
  const gapPercent = ((currentOpen - previousClose) / previousClose) * 100;
  return { gapUp: gapPercent > 0, gapDown: gapPercent < 0, gapPercent: Math.abs(gapPercent) };
}

module.exports = {
  calculateRSI, calculateSMA, calculateEMA,
  calculateFibRetracement, findRecentHighLow, detectGap
};
