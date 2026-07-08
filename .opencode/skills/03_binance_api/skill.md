# Binance API Integration

## Endpoints
- Testnet Spot: https://testnet.binance.vision
- Testnet Futures: https://testnet.binancefuture.com

## Key functions (binanceClient.js)
- `getKlines(symbol, interval, limit, type)` - OHLCV data
- `getTickerPrice(symbol, type)` - Current price
- `get24hrTicker(symbol, type)` - 24h stats
- `placeOrder(type, symbol, side, quantity, options)` - MARKET/LIMIT orders
- `cancelOrder(type, symbol, orderId)` - Cancel open order
- `setLeverage(symbol, leverage)` - Set futures leverage
- `getBalance(type)` - Account balance
- `getAccountInfo(type)` - Full account info

## API keys (.env)
- BINANCE_SPOT_API_KEY / BINANCE_SPOT_API_SECRET
- BINANCE_FUTURES_API_KEY / BINANCE_FUTURES_API_SECRET

## Notes
- All orders go to testnet
- Futures min notional: $50
- Spot min notional: $5
