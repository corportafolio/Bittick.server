const binance = require('./binanceClient');
const store = require('./tradingStore');
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
          const base = { ...signal, confidence: analysis.confidence, explanation: analysis.explanation, factors: analysis.factors, risks: analysis.risks, horizonte: analysis.horizonte };

          const futuresOp = { ...base, botType: 'futures' };
          store.insertOpportunity(futuresOp);
          results.push(futuresOp);
          signals.push(futuresOp);

          if (signal.strategyType === 'long') {
            const spotOp = { ...base, botType: 'spot' };
            store.insertOpportunity(spotOp);
            results.push(spotOp);
            signals.push(spotOp);
          }
        }
      } catch (strategyError) {
        logger.error('trading-strategy', `Strategy ${config.name} error: ${strategyError.message}`);
      }
    }

    const activeInscriptions = store.getActiveInscriptions();
    if (activeInscriptions.length > 0) {
      for (const op of signals) {
        if (op.confidence < 5) continue;
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
