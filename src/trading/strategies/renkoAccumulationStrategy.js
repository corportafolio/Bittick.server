const { calculateEMA } = require('../indicators');

function calculateATR(klines, period = 14) {
  if (klines.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

function findZones(klines, atr) {
  const slice = klines.slice(-80);
  const zones = [];
  const closes = slice.map(k => k.close);
  const ema50 = calculateEMA(closes, 50);

  const pivots = [];
  for (let i = 2; i < slice.length - 2; i++) {
    if (slice[i].high > slice[i-1].high && slice[i].high > slice[i-2].high &&
        slice[i].high > slice[i+1].high && slice[i].high > slice[i+2].high)
      pivots.push({ price: slice[i].high, type: 'high', time: slice[i].openTime });
    if (slice[i].low < slice[i-1].low && slice[i].low < slice[i-2].low &&
        slice[i].low < slice[i+1].low && slice[i].low < slice[i+2].low)
      pivots.push({ price: slice[i].low, type: 'low', time: slice[i].openTime });
  }

  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  let current = null;
  for (const p of sorted) {
    if (!current || Math.abs(p.price - current.mid) > atr * 1.5) {
      if (current && current.count >= 2) {
        const band = atr * 2;
        zones.push({
          startPrice: current.mid - band,
          endPrice: current.mid + band,
          midPrice: current.mid,
          strength: Math.min(10, current.count),
          type: current.type
        });
      }
      current = { prices: [p.price], mid: p.price, count: 1, type: p.type === 'high' ? 'resistencia' : 'soporte' };
    } else {
      current.prices.push(p.price);
      current.mid = current.prices.reduce((a, b) => a + b, 0) / current.prices.length;
      current.count++;
    }
  }
  if (current && current.count >= 2) {
    const band = atr * 2;
    zones.push({
      startPrice: current.mid - band,
      endPrice: current.mid + band,
      midPrice: current.mid,
      strength: Math.min(10, current.count),
      type: current.type
    });
  }

  const volSorted = [...slice].sort((a, b) => b.volume - a.volume);
  for (let i = 0; i < Math.min(3, volSorted.length); i++) {
    const k = volSorted[i];
    const band = atr * 1.5;
    const mid = (k.high + k.low) / 2;
    if (!zones.some(z => Math.abs(z.midPrice - mid) < atr * 0.5)) {
      zones.push({
        startPrice: mid - band,
        endPrice: mid + band,
        midPrice: mid,
        strength: 5,
        type: 'volumen'
      });
    }
  }

  if (ema50) {
    const band = atr * 3;
    if (!zones.some(z => Math.abs(z.midPrice - ema50) < atr)) {
      zones.push({
        startPrice: ema50 - band,
        endPrice: ema50 + band,
        midPrice: ema50,
        strength: 7,
        type: 'dinamico'
      });
    }
  }

  return zones;
}

function mergeOverlapping(zones) {
  if (zones.length <= 1) return zones;
  const sorted = [...zones].sort((a, b) => a.startPrice - b.startPrice);
  const result = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1];
    const curr = sorted[i];
    if (curr.startPrice <= last.endPrice * 1.01) {
      last.endPrice = Math.max(last.endPrice, curr.endPrice);
      last.startPrice = Math.min(last.startPrice, curr.startPrice);
      last.midPrice = (last.startPrice + last.endPrice) / 2;
      last.strength = Math.min(10, last.strength + curr.strength);
    } else {
      result.push(curr);
    }
  }
  return result;
}

function evaluate(klines, currentPrice) {
  if (!klines || klines.length < 60) return null;
  const atr = calculateATR(klines, 14);
  if (!atr || atr === 0) return null;

  const rawZones = findZones(klines, atr);
  const zones = mergeOverlapping(rawZones);
  if (zones.length === 0) return null;

  const last5 = klines.slice(-5);
  const momentum = last5[last5.length - 1].close - last5[0].close;
  const goingUp = momentum > 0;

  // Sort zones by price
  const sortedZones = [...zones].sort((a, b) => a.midPrice - b.midPrice);

  // Find the zone CURRENTLY OBSTRUCTING price (the one price is approaching)
  // and the NEXT ZONE beyond it (the magnet / target)
  let currentZone = null;
  let magnetZone = null;

  if (goingUp) {
    // Find the zone whose startPrice is above current price but closest
    const above = sortedZones.filter(z => z.startPrice > currentPrice);
    if (above.length === 0) return null;
    currentZone = above[0];
    // The magnet is the next zone above currentZone
    const idx = sortedZones.indexOf(currentZone);
    magnetZone = idx < sortedZones.length - 1 ? sortedZones[idx + 1] : null;
  } else {
    // Find the zone whose endPrice is below current price but closest
    const below = sortedZones.filter(z => z.endPrice < currentPrice);
    if (below.length === 0) return null;
    currentZone = below[below.length - 1]; // closest below
    const idx = sortedZones.indexOf(currentZone);
    magnetZone = idx > 0 ? sortedZones[idx - 1] : null;
  }

  // The BACK of the current zone = the far side in the direction of travel
  const backPrice = goingUp
    ? currentZone.endPrice + atr * 0.8
    : currentZone.startPrice - atr * 0.8;

  // Has price broken through the back of the current zone?
  const throughBack = goingUp
    ? currentPrice > backPrice
    : currentPrice < backPrice;

  // Distance from current price to the current zone
  const distToCurrentZone = goingUp
    ? ((currentZone.startPrice - currentPrice) / currentPrice) * 100
    : ((currentPrice - currentZone.endPrice) / currentPrice) * 100;

  // If there's a magnet zone, calculate distance to it
  const distToMagnet = magnetZone
    ? (goingUp
        ? ((magnetZone.midPrice - currentPrice) / currentPrice) * 100
        : ((currentPrice - magnetZone.midPrice) / currentPrice) * 100)
    : null;

  // Speed check (fast break = big candle)
  const lastCandle = klines[klines.length - 1];
  const prevCandle = klines.length >= 2 ? klines[klines.length - 2] : null;
  const candleRange = lastCandle.high - lastCandle.low;
  const fastMove = candleRange > atr * 0.8;
  const volumeSurge = prevCandle && lastCandle.volume > prevCandle.volume * 1.4;

  // ---- SCORE CALCULATION ----

  let score = 0;

  // Core: broken through the back of the current zone?
  if (throughBack && fastMove) score += 4;    // Fast break = strong
  else if (throughBack) score += 2;            // Broke but slow

  // Approaching the current zone (magnet effect pulling price in)
  if (!throughBack && Math.abs(distToCurrentZone) < 1.0) score += 2;
  else if (!throughBack && Math.abs(distToCurrentZone) < 3.0) score += 1;

  // Current zone strength
  if (currentZone.strength >= 7) score += 2;
  else if (currentZone.strength >= 4) score += 1;

  // Volume confirmation
  if (volumeSurge) score += 1;

  // Magnet zone exists and is reachable
  if (magnetZone && distToMagnet && distToMagnet > 0 && distToMagnet < 20) score += 1;

  const normalizedScore = Math.min(10, Math.max(1, score));

  // ---- CONFIDENCE ----
  let confidence = normalizedScore;
  if (throughBack && fastMove) confidence += 2;
  if (throughBack && volumeSurge) confidence += 1;
  if (currentZone.strength >= 6) confidence += 1;
  if (magnetZone && magnetZone.strength >= 6) confidence += 1;
  confidence = Math.min(10, Math.max(1, confidence));

  const strategyType = goingUp ? 'long' : 'short';

  // ---- SIGNAL GENERATION ----
  const entryLow = goingUp
    ? Math.round((currentZone.startPrice - atr) * 100) / 100
    : Math.round((currentZone.endPrice - atr * 2) * 100) / 100;
  const entryHigh = goingUp
    ? Math.round((currentZone.endPrice + atr) * 100) / 100
    : Math.round((currentZone.startPrice + atr) * 100) / 100;

  const target = magnetZone
    ? Math.round(magnetZone.midPrice * 100) / 100
    : (goingUp
        ? Math.round((backPrice + atr * 5) * 100) / 100
        : Math.round((backPrice - atr * 5) * 100) / 100);

  const sl = goingUp
    ? Math.round((currentZone.startPrice - atr * 1.5) * 100) / 100
    : Math.round((currentZone.endPrice + atr * 1.5) * 100) / 100;

  // Calculate EMA50 for the indicator data
  const closes = klines.map(k => k.close);
  const ema50 = calculateEMA(closes, 50);
  
  // Determine zone type for the signal
  const zoneType = currentZone.type;
  const zoneMid = currentZone.midPrice;
  const zoneStrength = currentZone.strength;
  
  // Support/Resistance zones based on zone type
  let supportZone = null;
  let resistanceZone = null;
  if (zoneType === 'soporte') {
    supportZone = `${currentZone.startPrice.toFixed(1)} - ${currentZone.endPrice.toFixed(1)}`;
  } else if (zoneType === 'resistencia') {
    resistanceZone = `${currentZone.startPrice.toFixed(1)} - ${currentZone.endPrice.toFixed(1)}`;
  }

  return {
    strategyType,
    asset: 'BTCUSDT',
    currentPrice,
    entryZone: `${entryLow} - ${entryHigh}`,
    target,
    stopLoss: sl,
    score: normalizedScore,
    // Indicator fields for professional analysis
    atr: Math.round(atr * 100) / 100,
    ema50: ema50 ? Math.round(ema50 * 100) / 100 : null,
    support_zone: supportZone,
    resistance_zone: resistanceZone,
    zone_type: zoneType,
    zone_mid: Math.round(zoneMid * 100) / 100,
    zone_strength: zoneStrength,
    // Signal data for frontend
    signals: {
      strategy: 'avizor_renko_accumulation',
      obstacleZone_start: Math.round(currentZone.startPrice * 100) / 100,
      obstacleZone_end: Math.round(currentZone.endPrice * 100) / 100,
      obstacleZone_mid: Math.round(currentZone.midPrice * 100) / 100,
      obstacleZone_type: currentZone.type,
      obstacleZone_strength: currentZone.strength,
      magnetZone_mid: magnetZone ? Math.round(magnetZone.midPrice * 100) / 100 : null,
      magnetZone_strength: magnetZone ? magnetZone.strength : null,
      backPrice: Math.round(backPrice * 100) / 100,
      throughBack,
      distanceToObstacle: Math.round(distToCurrentZone * 100) / 100,
      distanceToMagnet: distToMagnet !== null ? Math.round(distToMagnet * 100) / 100 : null,
      fastMove,
      volumeSurge,
      atr: Math.round(atr * 100) / 100,
      ema50: ema50 ? Math.round(ema50 * 100) / 100 : null
    }
  };
}

function getZones(klines, currentPrice) {
  if (!klines || klines.length < 60) return { zones: [], atr: 0 };
  const atr = calculateATR(klines, 14);
  if (!atr) return { zones: [], atr: 0 };
  const rawZones = findZones(klines, atr);
  const zones = mergeOverlapping(rawZones);

  const classified = zones.map(z => ({
    startPrice: Math.round(z.startPrice * 100) / 100,
    endPrice: Math.round(z.endPrice * 100) / 100,
    midPrice: Math.round(z.midPrice * 100) / 100,
    strength: Math.min(10, z.strength),
    zoneType: z.midPrice > currentPrice ? 'sell' : 'buy',
    type: z.type,
    label: z.midPrice > currentPrice ? 'Zona Venta' : 'Zona Compra'
  }));

  return { zones: classified, atr: Math.round(atr * 100) / 100 };
}

module.exports = { evaluate, getZones };
