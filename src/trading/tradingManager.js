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
    for (const config of configs) {
      if (!config.enabled) continue;
      const strategy = strategies[config.name];
      if (!strategy) continue;

      try {
        const signal = strategy.evaluate(klines, currentPrice);
        if (signal) {
          logger.info('trading', `Signal detected by ${config.name}: ${signal.strategyType} at $${signal.currentPrice} (score: ${signal.score})`);
          const analysis = await aiAnalyzer.analyze(signal);
          const op = { ...signal, confidence: analysis.confidence, explanation: analysis.explanation, factors: analysis.factors, risks: analysis.risks, horizonte: analysis.horizonte };
          store.insertOpportunity(op);
          results.push(op);

          if (analysis.confidence >= 5) {
            const executions = await botManager.evaluateAndExecute(op);
            if (executions.length > 0) {
              logger.info('trading', `Bot executed ${executions.length} order(s) for this signal.`);
            }
          }
        }
      } catch (strategyError) {
        logger.error('trading-strategy', `Strategy ${config.name} error: ${strategyError.message}`);
      }
    }
  } catch (error) {
    logger.error('trading', `Market scan error: ${error.message}`);
  }
  return results;
}

module.exports = { scanMarket };
