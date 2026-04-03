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

## Personal Project Notice

This is a personal project. While you're welcome to fork it and customize it for your own needs, I'm not accepting pull requests or feature contributions. This keeps the project simple and focused on my personal requirements.

If you'd like to use this project:

- ✅ Fork it - Make your own version
- ✅ Customize it - Modify the code as needed
- ✅ Report bugs - File issues for actual bugs
- ❌ Submit pull requests - I won't be reviewing these
- ❌ Request features - Feature requests won't be considered

## Disclaimer

This is a personal project built for educational and informational purposes only. It is not financial advice. Nothing in this application constitutes a recommendation to buy, sell, or hold any cryptocurrency or other investment. All signals, indicators, and position sizing suggestions are purely algorithmic and do not account for your individual financial situation, risk tolerance, or investment objectives.

Cryptocurrency markets are highly volatile. You could lose some or all of your investment. Always do your own research and consult a qualified financial adviser before making any investment decisions. Use this tool entirely at your own risk.

This software is provided as-is with no warranty of any kind. The author accepts no liability for any losses, damages, or other consequences arising from the use of this application.
