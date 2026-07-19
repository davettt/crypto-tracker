# Changelog

## [2.5.0] - 2026-05-03

### Security & Quality

- Added `eslint-plugin-security` for static security analysis of frontend code
- Added `husky` with pre-commit hook for automated quality gates
- Added `license-checker` for dependency license compliance
- Created `allowed-packages.json` dependency allowlist
- Added GitHub Actions CI workflow and Dependabot configuration
- Dependabot config synced with shared build-policy template (7-day cooldown on version updates now standard)
- Added `test:smoke` script for basic server health checking
- Fixed all npm audit vulnerabilities (shell-quote, vite, postcss, babel, qs, brace-expansion)
- Updated `.gitignore` to cover all private/policy files
- Enabled eslint for the entire Express server (previously excluded from linting)
- Fixed dead code: removed unused variables/imports in indicators.js, portfolio.js, import.js, buildCheck.js
- Fixed regex escape in import CSV parser
- Added `no-unused-vars` with `_` prefix pattern for intentionally unused parameters

### Added

- **NEAR Protocol** added to the asset registry — AI-adjacent L1 with chain abstraction, recent partnerships (Nvidia, Deutsche Telekom), and exposure to decentralised AI infrastructure
- **Floor Detection indicator** — detects potential natural price floors by combining three conditions: price stability (<25% range over 30 days), 200-day MA converging from above (declining, gap narrowing, within 30%), and RSI recovery (dipped below 40 in last 12 weeks, 4-week average recovered to 38-60). Fires as a moderate buy signal to reinforce other indicators without driving the assessment alone. Assets with RSI stuck oversold ("dead money") or MA still far above are correctly filtered out
- **Per-asset price level alerts** — set target prices with direction (above/below) and optional notes. Alerts fire via email when price crosses the target. Shown as color-coded pills in the price header. Re-arm and remove inline
- **Per-asset investment thesis notes** — editable inline below the asset name in the price header. Stored in `local_data/asset_notes.json` (not committed). API: `GET /api/notes`, `PUT /api/notes/:asset`
- **Asset descriptions** — brief factual description of each asset shown in the price header
- Total profit column in target sell price tables — profit/unit multiplied by holdings for that tier

### Changed

- **Target sell price calculator redesigned** — now shows 1.5x/2x/2.5x multiples of overall avg cost (was +25%/+50%/+75%/+100% net gain percentages). Separate tables for long-term (CGT discount rate) and short-term (full marginal rate) holdings, each showing: sell price, net/unit after fees+tax, profit/unit, total profit, and gain %. Makes it immediately clear what you actually take home and how much you can sell at the lower tax rate
- **Alert target multiples** updated to 1.5x/2x/2.5x (was 1.5x/2x/3x/5x) — consistent with the target calculator UI
- **Portfolio avg cost** now uses FIFO cost basis of remaining open lots (was all-time buy average including sold lots). Matches the target sell price calculator
- **P&L label** changed to "Overall P&L" — clarifies it includes proceeds from past sales, not just unrealised gain on current holdings
- Floor Detection explainer in SignalPanel updated to describe all three conditions including RSI recovery and "dead money" filtering

### Fixed

- **Alert state not saving** — `stateKey` variable was scoped inside an `if` block but referenced in the `else` branch, causing a ReferenceError that prevented state from persisting. This caused duplicate signal-change emails on every server restart. Fixed by moving the variable declaration outside the conditional
- **AlertSettings showing "(disabled)"** when alerts were actually enabled — config was only fetched when the settings panel was opened. Now fetches on component mount

## [2.4.0] - 2026-04-22

### Added

- **Email alerts via Resend** — configurable email notifications checked every 4 hours, with three trigger types:
  - **Signal state changes**: notifies when an asset's overall assessment shifts (e.g. HOLD → STRONG BUY)
  - **24h price movement**: alerts when any asset moves beyond a configurable threshold (default ±10%)
  - **Target sell price approach**: alerts when price nears 1.5x/2x/3x/5x multiples of your average cost basis, factoring in exchange fees and CGT
- Alert settings UI at the bottom of the page — configure email, Resend API key, toggle individual triggers, adjust thresholds
- "Send Test Email" button to verify configuration before relying on live alerts
- "Check Now" button to manually trigger an alert check on demand
- Alert state tracking prevents duplicate emails — resets when conditions clear

## [2.3.0] - 2026-04-17

### Added

- **Chainlink (LINK)** added to the asset registry — blue-chip oracle infrastructure with real traditional-finance partnerships (SWIFT, DTCC, Fidelity, ANZ) and exposure to the tokenisation narrative

### Changed

- Target sell price rows now step at +25% / +50% / +75% / +100% (previously +15% / +20% / +25% / +30%) — better aligned with a long-term hold thesis where small gains are not actionable sell triggers
- Indicator help text (200-Day MA, 200-Week MA, Mayer Multiple, ATH Drawdown) rewritten to be asset-agnostic. Bitcoin-specific history still called out as reference, but explainers now apply across all tracked assets (was previously BTC-centric)

### Removed

- **Fetch.ai / ASI (FET)** removed from the asset registry — thesis weakened by the Aug-2024 ASI merger dilution, lack of blue-chip partnerships, and overlap with RENDER/TAO for AI narrative exposure

## [2.2.0] - 2026-04-15

### Added

- **Stale build detection** — amber banner in the UI (and server-side console warning) prompts `npm run restart:pm2` when files in `src/` or `server/` have changed since the last build; new `GET /api/build-status` endpoint and `.last-build` marker written by `npm run build`

## [2.1.0] - 2026-04-08

### Added

- TRON (TRX) added as a 5th tracked asset — low-volatility, stablecoin-rails utility play
- "Actual crypto received" override field on Add and Edit transaction forms — for exchanges like Revolut where the displayed price rounds but execution includes a spread. When set, the effective price is back-derived from `(amount − fee) / override` so FIFO cost basis matches the exchange statement exactly
- Refresh button now bypasses the 4-hour cache via `?force=true` — clears in-memory and file caches for the active asset and fetches fresh data from CoinGecko. Normal page loads and tab switches still use the 4hr cache to respect rate limits
- CoinSpot CSV import now recognises `TRX/AUD` market pair

### Changed

- Price chart's last data point now uses the live current price from the overview endpoint (not the possibly-stale daily close from CoinGecko's `market_chart`). The chart endpoint now fetches the current price alongside history and injects it as today's point so MA/Mayer/RSI indicators are computed against the latest price
- PriceChart component accepts `currentPriceUsd` prop and overrides the last point's display value client-side, using the same conversion path as the header — eliminates the small discrepancy between chart's trailing point and the header price
- Portfolio transaction rows use adaptive price formatting (`fmtPrice`) — shows 2 decimals for values under $10k, more for smaller-priced assets. Previously rounded to whole numbers, which hid sub-dollar precision from override-derived prices

### Fixed

- Chart's final data point no longer lags the live market price shown in the header

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
