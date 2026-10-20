# InvestAI read-only API contract

All responses must be JSON and should be served over HTTPS. Include `Cache-Control: no-store` for sensitive account data. Authenticate every endpoint.

## GET /api/v1/health
```json
{"status":"ok","server_time":"2026-10-20T03:14:00Z","source":"webull-bot"}
```

## GET /api/v1/portfolio
```json
{
  "currency":"USD",
  "virtual_equity":10043.07,
  "realized_pnl":178.44,
  "unrealized_pnl":43.07,
  "daily_pnl":12.31,
  "daily_pnl_percent":0.12,
  "updated_at":"2026-10-20T03:14:00Z"
}
```

## GET /api/v1/positions
```json
{
  "positions":[
    {"symbol":"STX","name":"Seagate Technology","quantity":2,"side":"long","market_value":249.60,"unrealized_pnl":5.88,"unrealized_pnl_percent":2.41,"average_entry_price":121.86,"current_price":124.80}
  ],
  "updated_at":"2026-10-20T03:14:00Z"
}
```

## GET /api/v1/trades
```json
{
  "trades":[
    {"id":"trade-001","symbol":"STX","side":"long","status":"closed","quantity":2,"entry_price":121.86,"exit_price":124.80,"realized_pnl":5.88,"opened_at":"2026-10-19T14:31:00-04:00","closed_at":"2026-10-19T15:02:00-04:00","strategy":"Breakout"}
  ]
}
```

## GET /api/v1/analytics
```json
{
  "win_rate":54.2,
  "closed_trades":42,
  "average_win":18.42,
  "average_loss":-11.37,
  "max_drawdown_percent":3.8,
  "daily":[{"date":"2026-10-19","pnl":12.31}]
}
```

Use ISO 8601 timestamps with explicit UTC or timezone offsets. The client should not assume the bot's local timezone. The server should normalize the actual source logs and preserve source IDs, partial exits, short positions, and confirmed fills; do not derive realized P/L from current quotes.
