const { calculateSMA } = require('../indicators');

function evaluate(klines, currentPrice) {
  if (!klines || klines.length < 50) return null;

  const closes = klines.map(k => k.close);
  const lookback = 50;
  const prices = klines.slice(-lookback);
  const highs = prices.map(k => k.high);
  const lows = prices.map(k => k.low);

  const resistance = Math.max(...highs.slice(-20));
  const support = Math.min(...lows.slice(-20));
  const sma20 = calculateSMA(closes, 20);

  const rangePercent = ((resistance - support) / support) * 100;
  if (rangePercent > 12) return null;

  const distanceToSupport = ((currentPrice - support) / support) * 100;
  const distanceToResistance = ((resistance - currentPrice) / currentPrice) * 100;

  if (distanceToSupport < 2 && sma20 && currentPrice < sma20) {
    const score = Math.min(10, Math.max(1, Math.round(((2 - distanceToSupport) / 2) * 5 + 3)));
    if (score < 4) return null;
    return {
      strategyType: 'long',
      asset: 'BTCUSDT',
      currentPrice,
      entryZone: `${(support * 0.99).toFixed(1)} - ${(support * 1.01).toFixed(1)}`,
      target: resistance,
      stopLoss: support * 0.97,
      score,
      signals: { type: 'range_long', support: support.toFixed(1), resistance: resistance.toFixed(1), distanceToSupport: distanceToSupport.toFixed(2), rangePercent: rangePercent.toFixed(2) }
    };
  }

  if (distanceToResistance < 2 && sma20 && currentPrice > sma20) {
    const score = Math.min(10, Math.max(1, Math.round(((2 - distanceToResistance) / 2) * 5 + 3)));
    if (score < 4) return null;
    const entryLow = resistance * 0.99;
    const shortTarget = Math.min(support, entryLow * 0.98);
    return {
      strategyType: 'short',
      asset: 'BTCUSDT',
      currentPrice,
      entryZone: `${entryLow.toFixed(1)} - ${(resistance * 1.01).toFixed(1)}`,
      target: shortTarget,
      stopLoss: resistance * 1.03,
      score,
      signals: { type: 'range_short', support: support.toFixed(1), resistance: resistance.toFixed(1), distanceToResistance: distanceToResistance.toFixed(2), rangePercent: rangePercent.toFixed(2) }
    };
  }

  return null;
}

module.exports = { evaluate };
