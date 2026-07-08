# bittick-server Architecture

## Stack
- Node.js + Express (port 4001)
- SQLite via sql.js (file: data/trading.db)
- PM2 process manager (bittick-server)
- Binance Testnet API (spot + futures)

## Directory structure
```
bittick-server/
├── index.js                 # Entry point
├── .env                     # API keys + config
├── ecosystem.config.js      # PM2 config
├── src/
│   ├── logger/logger.js     # JSON logger
│   ├── config/constants.js  # Log levels, paths
│   ├── trading/
│   │   ├── tradingStore.js      # SQLite CRUD
│   │   ├── tradingRouter.js     # REST endpoints
│   │   ├── tradingScheduler.js  # cron jobs (scan, monitor, cleanup)
│   │   ├── tradingManager.js    # Market scanner
│   │   ├── botManager.js        # Position sizing + execution
│   │   ├── executionEngine.js   # Binance order execution
│   │   ├── binanceClient.js     # Binance API client
│   │   ├── aiAnalyzer.js        # AI signal analysis
│   │   ├── indicators.js        # Technical indicators
│   │   └── strategies/          # Trading strategies
│   ├── chart/
│   │   └── chartRouter.js   # Klines + ticker endpoints
│   └── ai/
│       └── aiConnector.js   # GitHub Models + Hermes + OpenCode
```

## Key differences from servidor_Corp
- BTC/USDT only (no multi-coin)
- No WhatsApp, email, empleos, social, commits
- Added chart/klines endpoint for candlestick data
- Simplified aiConnector.js (no email processing)
- Dedicated .opencode skills for trading
