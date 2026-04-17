# Crypto Tracker

Multi-asset crypto tracker (BTC, ETH, SOL, RENDER, TRX, TAO, LINK) with buy/sell signals for long-term holders. Analyses technical indicators, provides position sizing suggestions, tracks your portfolio with FIFO cost basis, and calculates Australian tax obligations.

## Features

- **Multi-asset**: BTC, ETH, SOL, RENDER, TRX, TAO, LINK with tab navigation
- Price chart with 200-day MA overlay and buy/sell transaction markers at historical entry prices
- Weekly RSI chart with overbought/oversold zones
- Buy/sell signals: Weekly RSI, 200-Day MA, 200-Week MA, Mayer Multiple, ATH Drawdown
- Fear & Greed Index (Bitcoin-specific)
- Position calculator with DCA and Lump Sum modes, all-asset portfolio value
- Portfolio tracker with transaction history, edit, and P&L per asset
- FIFO cost basis engine with automatic lot matching
- Australian tax report: FY summary, CGT with 50% discount for >12 month holdings, CSV export
- Target sell price calculator factoring in exchange fees and tax rates
- CoinSpot CSV import with duplicate detection
- Actual crypto amount override on transaction forms — back-derives the effective price so FIFO cost basis matches exchange statements exactly (handles Revolut-style spread)
- Refresh button bypasses the 4-hour cache for on-demand fresh prices; normal loads still use cache to respect rate limits
- Home currency setting with 8 supported currencies (USD, AUD, GBP, EUR, JPY, NZD, SGD, CAD)
- Display currency toggle to view market data in any supported currency
- Transaction amounts stored in home currency — no exchange rate drift
- CSV export for tax records and transactions
- Persistent price history (accumulates over time for future 200-week MA)

## Disclaimer

This is a personal project built for educational and informational purposes only. It is not financial advice. Nothing in this application constitutes a recommendation to buy, sell, or hold any cryptocurrency or other investment. All signals, indicators, and position sizing suggestions are purely algorithmic and do not account for your individual financial situation, risk tolerance, or investment objectives.

The tax calculations in this application (including FIFO cost basis, CGT discount, and estimated tax) are based on a simplified interpretation of Australian tax rules and have not been verified for accuracy. Tax laws change frequently and vary by jurisdiction. Do not rely on this application for tax reporting — always consult a qualified tax professional or accountant for your actual tax obligations.

Cryptocurrency markets are highly volatile. You could lose some or all of your investment. Always do your own research and consult a qualified financial adviser before making any investment decisions. Use this tool entirely at your own risk.

This software is provided as-is with no warranty of any kind. The author accepts no liability for any losses, damages, or other consequences arising from the use of this application.

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

- `price_cache_{asset}_{currency}.json` — 4-hour API response cache per (asset, currency) pair
- `price_history_{asset}_{currency}.json` — persistent daily price history per (asset, currency) pair, fetched natively from CoinGecko in that currency (grows over time)
- `portfolio.json` — investment pool settings, transactions, and tax settings

Each `(asset, currency)` pair is fetched natively from CoinGecko (`vs_currency=<currency>`), so historical chart values, the 200-day MA, and transaction markers are all authentic historical prices in your home currency — not USD series converted through today's FX rate. Viewing the chart in a currency other than your home currency still applies today's FX to cross over, but the common case (display === home) is exact.

## Personal Project Notice

This is a personal project. While you're welcome to fork it and customize it for your own needs, I'm not accepting pull requests or feature contributions. This keeps the project simple and focused on my personal requirements.

If you'd like to use this project:

- ✅ Fork it - Make your own version
- ✅ Customize it - Modify the code as needed
- ✅ Report bugs - File issues for actual bugs
- ❌ Submit pull requests - I won't be reviewing these
- ❌ Request features - Feature requests won't be considered
