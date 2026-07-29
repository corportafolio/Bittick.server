const { calculateRSI, calculateSMA, calculateFibRetracement } = require('../indicators');

function evaluate(klines, currentPrice) {
  if (!klines || klines.length < 60) return null;

  const closes = klines.map(k => k.close);
  const high = Math.max(...klines.slice(-50).map(k => k.high));
  const low = Math.min(...klines.slice(-50).map(k => k.low));
  const dropPercent = ((currentPrice - high) / high) * 100;

  if (dropPercent > -8) return null;

  const rsiValues = calculateRSI(closes, 14);
  if (!rsiValues || rsiValues.length === 0) return null;
  const currentRSI = rsiValues[rsiValues.length - 1];
  if (currentRSI > 35) return null;

  const sma50 = calculateSMA(closes, 50);
  const sma20 = calculateSMA(closes, 20);
  const fib = calculateFibRetracement(high, low);

  const volumeSpike = klines.length >= 2 && klines[klines.length - 1].volume > klines[klines.length - 2].volume * 1.5;
  let volume = 'normal';
  if (volumeSpike) volume = 'alto';

  let score = 0;
  if (dropPercent < -12) score += 3;
  else if (dropPercent < -10) score += 2;
  else score += 1;
  if (currentRSI < 25) score += 2;
  else if (currentRSI < 30) score += 1;
  if (sma50 && currentPrice < sma50) score += 1;
  if (volumeSpike) score += 1;
  const normalizedScore = Math.min(10, Math.round((score / 7) * 10));

  return {
    strategyType: 'long',
    asset: 'BTCUSDT',
    currentPrice,
    entryZone: `${(fib.level618 * 0.99).toFixed(1)} - ${(fib.level618 * 1.01).toFixed(1)}`,
    target: fib.level382 != null ? fib.level382 : currentPrice * 1.05,
    stopLoss: low * 0.97,
    score: normalizedScore,
    rsi: currentRSI,
    drop_percent: dropPercent.toFixed(2),
    sma50: sma50 ? Math.round(sma50 * 100) / 100 : null,
    sma20: sma20 ? Math.round(sma20 * 100) / 100 : null,
    signals: { dropPercent: dropPercent.toFixed(2), rsi: currentRSI.toFixed(1), volume, fibLevel618: fib.level618.toFixed(1), fibLevel382: fib.level382?.toFixed(1) }
  };
}

module.exports = { evaluate };
