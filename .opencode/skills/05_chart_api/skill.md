# Chart Data API

## Endpoints

### GET /api/chart/klines
Parameters:
- interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1s, 1M (default: 1h)
- limit: max 500 (default: 200)
- type: spot (default) or futures

Returns array of:
```json
{
  "openTime": 1234567890000,
  "open": 66000.0,
  "high": 66500.0,
  "low": 65800.0,
  "close": 66300.0,
  "volume": 1234.5,
  "closeTime": 1234567895000
}
```

### GET /api/chart/ticker
Returns current BTC/USDT price + 24h stats (priceChange, priceChangePercent, highPrice, lowPrice, volume, quoteVolume)
