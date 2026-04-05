# Changelog

## [2.0.0] - 2026-04-06

### Added

- Multi-asset support: BTC, ETH, SOL, RENDER with tab navigation
- Asset-specific price data, charts, signals from CoinGecko
- Fear & Greed Index shown for BTC only (it's a Bitcoin-specific index)
- CoinSpot CSV import with preview, duplicate detection, and confirm flow
- FIFO cost basis engine — automatic lot matching for sells against oldest buys
- Australian tax report: FY selector (July-June), CGT summary with 50% discount for holdings >12 months, disposals table, CSV export
- Tax settings: marginal tax rate (AU brackets) and exchange fee rate with common platform rates listed
- Target sell price calculator: shows prices needed for 15-30% net gain after fees and tax, split by short-term vs long-term holdings
- Transaction edit and platform field support
- Per-asset portfolio tracking with dynamic decimal formatting

### Changed

- Title: "BTC Market Tracker" → "Crypto Tracker"
- Position calculator now shows all-asset combined crypto value and total portfolio value
- Remaining cash tracks buys/sells across all assets, shows "over-deployed" when negative
- Price formatting: adaptive decimals based on price magnitude (2dp under $10, 1dp under $1,000, 0dp above)
- 200-day MA chart line: removed confusing horizontal last-value marker
- CoinGecko rate limiting improved: 4s gap, global sequential queue, 429 retry with 30s backoff, request deduplication
- JSON body limit increased to 2MB for CSV import
- Data files now per-asset: `price_cache_bitcoin.json`, `price_history_bitcoin.json`, etc.

### Migration

- Existing transactions auto-migrate: `asset: 'bitcoin'` and `amountCrypto` fields added
- Old `price_cache.json` / `price_history.json` auto-renamed to bitcoin-prefixed versions

## [1.1.0] - 2026-04-04

### Added

- Home currency setting — set once, all transactions and investment pool stored in your local currency with no exchange rate drift
- 8 supported currencies: USD, AUD, GBP, EUR, JPY, NZD, SGD, CAD
- Display currency toggle in header — browse BTC prices and charts in any currency without affecting stored data
- CSV export of transaction history (ISO date format) for tax records
- Export available from Recent Transactions, View All modal, and currency reset flow
- Currency reset flow with type-DELETE confirmation to prevent accidental data loss
- Transaction history modal — shows 3 most recent inline, "View all" opens scrollable modal
- Auto-migration of existing portfolio data from USD-based to home currency storage

### Changed

- Layout restructured — Position Calculator and Portfolio moved to full-width row below charts, reducing sidebar scroll
- Transaction history now shows exact local currency amounts (no USD round-trip conversion)
- Fees displayed with 2 decimal places throughout
- Transaction form preview amounts shown with 2 decimal places
- Transaction rows lead with currency amount, BTC details secondary

## [1.0.0] - 2026-04-03

### Added

- BTC price chart with 200-day moving average overlay
- Weekly RSI chart with overbought/oversold reference lines
- Market signals: Weekly RSI, 200-Day MA, Mayer Multiple, ATH Drawdown
- Fear & Greed Index gauge with history
- Clickable indicator explainers (what it is, why it matters)
- Overall buy/sell/hold assessment based on combined signals
- Position calculator with DCA and Lump Sum modes
- Conservative, moderate, and aggressive sizing suggestions
- Persistent investment pool with remaining cash tracking
- Portfolio tracker with buy/sell transaction recording
- Transaction fees support with accurate BTC calculation
- Auto-generated trade notes from current market signals
- P&L tracking with unrealised gains/losses
- USD/AUD currency toggle with live exchange rate
- Persistent price history that accumulates daily data over time
- CoinGecko free API with 4-hour response caching
- API rate limiting and input validation
