# Trading Engine (BTC/USDT)

## Scan cycle (every 60 seconds via node-cron)
1. Fetch 100 klines (1h) + current ticker from Binance
2. Run all enabled strategies
3. For each signal:
   - Insert opportunity in SQLite
   - Run AI analysis (confidence, explanation)
   - If confidence >= 5, evaluateAndExecute

## Strategies
- **longAfterDrop**: BTC dropped >8%, RSI <35, look for bounce
- **shortAfterRise**: BTC rose >8%, RSI >65, look for pullback
- **rangeStrategy**: Tight range (<12%), trade support/resistance
- **spotFibStrategy**: Fibonacci retracement + RSI divergence

## Position sizing (TIERS)
nivel = Min(score, confidence)
- nivel 10: 5%, 3x leverage
- nivel 9: 10%, 3x
- nivel 8: 45%, 3x
- nivel 7: 20%, 2x
- nivel 6: 20%, 1x

## Monitor cycle (every 60 seconds)
- Check all open positions
- Update P&L with current price
- Close on take profit or stop loss

## Cleanup (daily at 3AM)
- Delete opportunities >10 days old
