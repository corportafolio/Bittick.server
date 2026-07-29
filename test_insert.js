const store = require('./src/trading/tradingStore');
store.init().then(() => {
  const testOp = {
    asset: 'BTCUSDT',
    strategyType: 'long',
    botType: 'futures',
    currentPrice: 63000,
    entryZone: '62000 - 64000',
    target: 65000,
    stopLoss: 60000,
    score: 7,
    confidence: 6,
    explanation: 'test',
    factors: [],
    risks: [],
    signals: { type: 'test' },
    horizonte: 'horas',
    botType: 'futures'
  };
  store.insertOpportunity(testOp);
  console.log('Insert worked');
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
