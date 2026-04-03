# Changelog

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
