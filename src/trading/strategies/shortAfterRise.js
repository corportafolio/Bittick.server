const { calculateRSI, calculateSMA, calculateFibRetracement } = require('../indicators');

function evaluate(klines, currentPrice) {
  if (!klines || klines.length < 60) return null;

  const closes = klines.map(k => k.close);
  const high = Math.max(...klines.slice(-50).map(k => k.high));
  const low = Math.min(...klines.slice(-50).map(k => k.low));
  const risePercent = ((currentPrice - low) / low) * 100;

  if (risePercent < 8) return null;

  const rsiValues = calculateRSI(closes, 14);
  if (!rsiValues || rsiValues.length === 0) return null;
  const currentRSI = rsiValues[rsiValues.length - 1];
  if (currentRSI < 65) return null;

  const sma20 = calculateSMA(closes, 20);
  const fib = calculateFibRetracement(high, low);

  let distanceFromSma = 0;
  if (sma20) distanceFromSma = ((currentPrice - sma20) / sma20) * 100;

  let score = 0;
  if (risePercent > 15) score += 3;
  else if (risePercent > 12) score += 2;
  else score += 1;
  if (currentRSI > 75) score += 2;
  else if (currentRSI > 70) score += 1;
  if (distanceFromSma > 10) score += 1;
  const volumeHigh = klines.length >= 2 && klines[klines.length - 1].volume > klines[klines.length - 2].volume * 2;
  if (volumeHigh) score += 1;
  const normalizedScore = Math.min(10, Math.round((score / 7) * 10));

    const entryLow = fib.level236 * 0.99;
    const fibTarget = fib.level500 != null ? fib.level500 : currentPrice * 0.95;
    const shortTarget = Math.min(fibTarget, entryLow * 0.98);
    return {
      strategyType: 'short',
      asset: 'BTCUSDT',
      currentPrice,
      entryZone: `${entryLow.toFixed(1)} - ${(fib.level236 * 1.01).toFixed(1)}`,
      target: shortTarget,
      stopLoss: high * 1.03,
      score: normalizedScore,
      signals: { risePercent: risePercent.toFixed(2), rsi: currentRSI.toFixed(1), distanceFromSma: distanceFromSma.toFixed(2), fibLevel236: fib.level236.toFixed(1), fibLevel500: fib.level500?.toFixed(1) }
    };
}

module.exports = { evaluate };
