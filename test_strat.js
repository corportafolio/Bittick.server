const range = require('./src/trading/strategies/rangeStrategy');
const fib = require('./src/trading/strategies/spotFibStrategy');

const mockKlines = Array(60).fill().map((_, i) => ({
  close: 63000 + Math.random() * 1000,
  high: 63500 + Math.random() * 1000,
  low: 62500 + Math.random() * 1000,
  open: 63000 + Math.random() * 1000,
  volume: 1000 + Math.random() * 500,
  openTime: Date.now() - (60-i)*60000
});

console.log('=== rangeStrategy ===');
const r1 = range.evaluate(mockKlines, 63500);
console.log('Keys:', Object.keys(r1));
console.log('sma_ema:', r1.sma_ema);
console.log('support_zone:', r1.support_zone);
console.log('resistance_zone:', r1.resistance_zone);
console.log('distance_pct:', r1.distance_pct);
console.log('fib_levels:', r1.fib_levels);

console.log('\n=== spotFibStrategy ===');
const r2 = fib.evaluate(mockKlines, 63500);
console.log('Keys:', Object.keys(r2));
console.log('rsi:', r2.rsi);
console.log('fib_level:', r2.fib_level);
console.log('drop_percent:', r2.drop_percent);
