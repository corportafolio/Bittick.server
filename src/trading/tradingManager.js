const binance = require('./binanceClient');
const store = require('./tradingStore');
const pool = require('../engine/poolStore');
const aiAnalyzer = require('./aiAnalyzer');
const botManager = require('./botManager');
const logger = require('../logger/logger');

const strategies = {
  longAfterDrop: require('./strategies/longAfterDrop'),
  shortAfterRise: require('./strategies/shortAfterRise'),
  rangeStrategy: require('./strategies/rangeStrategy'),
  spotFibStrategy: require('./strategies/spotFibStrategy'),
  renkoAccumulation: require('./strategies/renkoAccumulationStrategy')
};

const ASSET = 'BTCUSDT';

function parseEntryWorst(entryZone, esLong) {
  if (!entryZone) return null;
  const nums = String(entryZone).split('-').map(p => parseFloat(p.trim()) || 0);
  if (nums.length === 2) {
    const low = Math.min(nums[0], nums[1]);
    const high = Math.max(nums[0], nums[1]);
    return esLong ? high : low;
  }
  if (nums.length === 1) return nums[0];
  return null;
}

function validarMargen(signal) {
  const esLong = signal.strategyType === 'long';
  const entry = parseEntryWorst(signal.entryZone, esLong);
  const target = parseFloat(signal.target);
  if (!entry || !target) return false;
  const margenPct = esLong
    ? ((target - entry) / entry) * 100
    : ((entry - target) / entry) * 100;
  return margenPct >= 1.2;
}

async function scanMarket() {
  const results = [];
  try {
    const [klines, ticker] = await Promise.all([
      binance.getKlines(ASSET, '1h', 100),
      binance.getTickerPrice(ASSET)
    ]);
    const currentPrice = ticker.price;

    const configs = store.getStrategyConfigs();
    const signals = [];

    for (const config of configs) {
      if (!config.enabled) continue;
      const strategy = strategies[config.name];
      if (!strategy) continue;

      try {
const signal = strategy.evaluate(klines, currentPrice);
      if (signal) {
        logger.info('trading', `Signal detected by ${config.name}: ${signal.strategyType} at $${signal.currentPrice} (score: ${signal.score})`);
        const analysis = await aiAnalyzer.analyze(signal);
        const base = { ...signal, confidence: analysis.confidence, explanation: analysis.explanation, zona_actual: analysis.zona_actual, factors: analysis.factors, risks: analysis.risks, horizonte: analysis.horizonte };

        // Map strategy-specific indicator fields to standard opportunity fields
const mapIndicators = (sig) => ({
          rsi: sig.rsi ?? sig.signals?.rsi ?? null,
          open_interest: null,
          ema_50: sig.ema50 ?? sig.ema_50 ?? sig.signals?.ema50 ?? sig.signals?.ema_50 ?? null,
          sma_20: sig.sma20 ?? sig.sma_20 ?? sig.signals?.sma20 ?? sig.signals?.sma_20 ?? null,
          sma_ema: sig.sma_ema ?? sig.signals?.sma_ema ?? null,
          sma_50: sig.sma50 ?? sig.sma_50 ?? sig.signals?.sma50 ?? sig.signals?.sma_50 ?? null,
          support_zone: sig.support_zone ?? sig.signals?.support_zone ??
            (sig.signals?.obstacleZone_start && sig.signals?.obstacleZone_end
              ? `${sig.signals.obstacleZone_start} - ${sig.signals.obstacleZone_end}` : null),
          resistance_zone: sig.resistance_zone ?? sig.signals?.resistance_zone ??
            (sig.signals?.obstacleZone_type === 'resistencia' && sig.signals?.obstacleZone_start && sig.signals?.obstacleZone_end
              ? `${sig.signals.obstacleZone_start} - ${sig.signals.obstacleZone_end}` : null),
          atr: sig.atr ?? sig.signals?.atr ?? null,
          volume_ratio: null,
          zone_type: sig.zone_type ?? sig.signals?.zone_type ?? sig.signals?.obstacleZone_type ?? null,
          zone_mid: sig.zone_mid ?? sig.signals?.zone_mid ?? sig.signals?.obstacleZone_mid ?? null,
          zone_strength: sig.zone_strength ?? sig.signals?.obstacleZone_strength ?? sig.signals?.zone_strength ?? null,
          zone_start: sig.zone_start ?? sig.signals?.zone_start ?? sig.signals?.obstacleZone_start ?? null,
          zone_end: sig.zone_end ?? sig.signals?.zone_end ?? sig.signals?.obstacleZone_end ?? null,
          rise_percent: sig.rise_percent ?? sig.drop_percent ?? sig.dropPercent ?? null,
          drop_pct: sig.drop_percent ?? sig.dropPercent ?? sig.rise_percent ?? null,
          distance_pct: sig.distance_pct ?? sig.signals?.distance_pct ?? sig.signals?.distanceToObstacle ?? sig.signals?.distanceToMagnet ?? sig.signals?.distanceToResistance ?? sig.signals?.distanceToSupport ?? null,
          fib_levels: sig.fib_levels ?? sig.fib_level ?? sig.signals?.fibLevel618 ? `61.8%: ${sig.signals.fibLevel618}` : sig.signals?.fibLevel786 ? `78.6%: ${sig.signals.fibLevel786}` : sig.signals?.fibLevel500 ? `50%: ${sig.signals.fibLevel500}` : sig.signals?.fibLevel382 ? `38.2%: ${sig.signals.fibLevel382}` : null,
        });

        const indicatorFields = mapIndicators(signal);
        const futuresOp = { ...base, botType: 'futures', ...indicatorFields };
        futuresOp.id = store.insertOpportunity(futuresOp);
        results.push(futuresOp);
        signals.push(futuresOp);
if (signal.strategyType === 'long') {
          const spotOp = { ...base, botType: 'spot', ...indicatorFields };
          spotOp.id = store.insertOpportunity(spotOp);
          results.push(spotOp);
          signals.push(spotOp);
        }
      }

      } catch (strategyError) {
        logger.error('trading-strategy', `Strategy ${config.name} error: ${strategyError.message}`);
      }
    }

const activeInscriptions = pool.getActiveInscriptions();
    if (activeInscriptions.length > 0) {
      for (const op of signals) {
        if (op.confidence < 3) continue;
        for (const insc of activeInscriptions) {
          try {
            const executions = await botManager.evaluateAndExecute(op, {
              inscriptionId: insc.inscription_id,
              address: insc.address,
              botNum: insc.bot_num
            });
            if (executions.length > 0) {
              logger.info('trading', `Bot #${insc.bot_num} executed ${executions.length} order(s) for ${insc.address}`);
            }
          } catch (botError) {
            logger.error('trading', `Bot #${insc.bot_num} error: ${botError.message}`);
          }
        }
      }
    }
  } catch (error) {
    logger.error('trading', `Market scan error: ${error.message}`);
  }
  return results;
}

module.exports = { scanMarket };
