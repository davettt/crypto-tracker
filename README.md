# Crypto Tracker

BTC market tracker with buy/sell signals for long-term holders. Analyses technical indicators, provides position sizing suggestions, and tracks your portfolio.

## Features

- Price chart with 200-day MA overlay
- Weekly RSI chart with overbought/oversold zones
- Buy/sell signals: Weekly RSI, 200-Day MA, Mayer Multiple, ATH Drawdown, Fear & Greed
- Position calculator with DCA and Lump Sum modes
- Portfolio tracker with transaction history and P&L
- USD/AUD currency toggle
- Persistent price history (accumulates over time for future 200-week MA)

## Setup

```bash
npm install
npm run build
```

Add to PM2 via the parent `ecosystem.config.js` or run directly:

```bash
node server/index.js
```

## Environment Variables

No API keys required. CoinGecko free tier and alternative.me Fear & Greed API are used.

| Variable   | Default | Description                                  |
| ---------- | ------- | -------------------------------------------- |
| `PORT`     | `3007`  | Server port                                  |
| `NODE_ENV` | —       | Set to `production` to serve static frontend |

## Development

```bash
npm run dev   # Vite dev server + Express via concurrently
```

## Production

```bash
npm run restart:pm2
```

## Quality

```bash
npm run check    # lint + format:check + type-check
npm run security # npm audit
```

## Data

All data is stored locally in `local_data/` (gitignored):

- `price_cache.json` — 4-hour API response cache
- `price_history.json` — persistent daily price history (grows over time)
- `portfolio.json` — investment pool settings and transactions
