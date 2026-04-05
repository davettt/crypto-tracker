import { useState } from "react";
import type {
  Signal,
  Overall,
  Currency,
  Transaction,
  PortfolioSettings,
  AssetId,
  MarketOverview,
} from "../types";
import { ASSETS, ASSET_LIST, CURRENCIES, CURRENCY_SYMBOLS } from "../types";

type Mode = "dca" | "lump";

const BUY_ALLOCATIONS: Record<
  Mode,
  Record<string, [number, number, number]>
> = {
  dca: {
    "STRONG BUY": [0.05, 0.1, 0.2],
    BUY: [0.03, 0.07, 0.15],
    ACCUMULATE: [0.02, 0.05, 0.1],
    HOLD: [0, 0.02, 0.05],
  },
  lump: {
    "STRONG BUY": [0.3, 0.5, 0.75],
    BUY: [0.15, 0.3, 0.5],
    ACCUMULATE: [0.1, 0.2, 0.35],
    HOLD: [0, 0.05, 0.1],
  },
};

const SELL_ALLOCATIONS: Record<string, [number, number, number]> = {
  "CONSIDER SELLING": [0.1, 0.25, 0.4],
  CAUTION: [0.05, 0.15, 0.25],
};

const RISK_LABELS = ["Conservative", "Moderate", "Aggressive"] as const;
const RISK_COLORS = [
  "border-blue-200 bg-blue-50",
  "border-amber-200 bg-amber-50",
  "border-red-200 bg-red-50",
];
const RISK_TEXT = ["text-blue-700", "text-amber-700", "text-red-700"];

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getCryptoAmount(t: Transaction): number {
  return t.amountCrypto ?? t.amountBtc ?? 0;
}

export default function PositionCalculator({
  overall,
  signals,
  currentPrice,
  homeCurrency,
  symbol,
  transactions,
  settings,
  activeAsset,
  overviewByAsset,
  onSettingsChange,
  onHomeCurrencyChange,
}: {
  overall: Overall;
  signals: Signal[];
  currentPrice: number;
  homeCurrency: Currency;
  symbol: string;
  transactions: Transaction[];
  settings: PortfolioSettings | null;
  activeAsset: AssetId;
  overviewByAsset: Partial<Record<AssetId, MarketOverview>>;
  onSettingsChange: () => void;
  onHomeCurrencyChange: (c: string) => void;
}) {
  const [editingCapital, setEditingCapital] = useState(false);
  const [capitalInput, setCapitalInput] = useState("");
  const [holdingsInput, setHoldingsInput] = useState("");
  const [showCurrencyReset, setShowCurrencyReset] = useState(false);
  const [pendingCurrency, setPendingCurrency] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const assetConfig = ASSETS[activeAsset];
  const assetSymbol = assetConfig.symbol;
  const assetDecimals = assetConfig.decimals;

  async function saveSettings(updates: Partial<PortfolioSettings>) {
    await fetch("/api/portfolio/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    onSettingsChange();
  }

  if (!settings) return null;

  const mode = settings.mode;
  const initialCapital = settings.initialCapital;
  const needsConfirmation =
    settings.needsCapitalConfirmation && initialCapital > 0;

  if (needsConfirmation && !editingCapital) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Position Calculator
        </h3>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">
            Confirm investment pool
          </p>
          <p className="mt-1 text-xs text-amber-600">
            Your investment pool was previously stored in USD. Please confirm
            the amount in {homeCurrency}.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              value={capitalInput}
              onChange={(e) => setCapitalInput(e.target.value)}
              placeholder={`Amount in ${homeCurrency}`}
              className="flex-1 rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            />
            <button
              onClick={() => {
                const val = parseFloat(capitalInput) || 0;
                void saveSettings({ initialCapital: val });
              }}
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Compute remaining cash using ALL transactions across all assets
  const totalBought = transactions
    .filter((t) => t.type === "buy")
    .reduce((s, t) => s + (t.amount ?? t.amountLocal ?? 0), 0);
  const totalSold = transactions
    .filter((t) => t.type === "sell")
    .reduce((s, t) => s + (t.amount ?? t.amountLocal ?? 0), 0);
  const remainingCash = initialCapital - totalBought + totalSold;

  // Current asset holdings (filtered to active asset)
  const assetTxs = transactions.filter(
    (t) => (t.asset ?? "bitcoin") === activeAsset,
  );
  const totalBoughtCrypto = assetTxs
    .filter((t) => t.type === "buy")
    .reduce((s, t) => s + getCryptoAmount(t), 0);
  const totalSoldCrypto = assetTxs
    .filter((t) => t.type === "sell")
    .reduce((s, t) => s + getCryptoAmount(t), 0);
  const cryptoHoldings = totalBoughtCrypto - totalSoldCrypto;
  const cryptoValue = cryptoHoldings * currentPrice;

  // Total crypto value across all assets
  let allCryptoValue = 0;
  for (const assetId of ASSET_LIST) {
    const overview = overviewByAsset[assetId];
    if (!overview) continue;
    const assetPrice = overview.current.price;
    const assetTxsAll = transactions.filter(
      (t) => (t.asset ?? "bitcoin") === assetId,
    );
    const bought = assetTxsAll
      .filter((t) => t.type === "buy")
      .reduce((s, t) => s + getCryptoAmount(t), 0);
    const sold = assetTxsAll
      .filter((t) => t.type === "sell")
      .reduce((s, t) => s + getCryptoAmount(t), 0);
    allCryptoValue += (bought - sold) * assetPrice;
  }

  const totalValue = remainingCash + allCryptoValue;
  const totalPnl = totalValue - initialCapital;
  const totalPnlPct =
    initialCapital > 0 ? (totalPnl / initialCapital) * 100 : 0;

  const buyAllocs = BUY_ALLOCATIONS[mode][overall.action];
  const sellAllocs = SELL_ALLOCATIONS[overall.action];

  const isBuySide =
    overall.action === "STRONG BUY" ||
    overall.action === "BUY" ||
    overall.action === "ACCUMULATE" ||
    overall.action === "HOLD";

  const strongBuyCount = signals.filter(
    (s) => s.type === "buy" && s.strength === "strong",
  ).length;
  const buyCount = signals.filter((s) => s.type === "buy").length;

  const holdingsNum = parseFloat(holdingsInput) || cryptoHoldings;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Position Calculator
        </h3>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-400">Home</label>
          {transactions.length > 0 ? (
            <span className="rounded border border-gray-100 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-500">
              {CURRENCY_SYMBOLS[homeCurrency]} {homeCurrency}
            </span>
          ) : (
            <select
              value={homeCurrency}
              onChange={(e) => void onHomeCurrencyChange(e.target.value)}
              className="rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-600 outline-none focus:border-blue-400"
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {CURRENCY_SYMBOLS[code]} {code}
                </option>
              ))}
            </select>
          )}
          {transactions.length > 0 && (
            <button
              onClick={() => {
                setPendingCurrency("");
                setConfirmText("");
                setShowCurrencyReset(true);
              }}
              className="text-xs text-gray-400 hover:text-gray-600"
              title="Change home currency"
            >
              Change
            </button>
          )}
        </div>
      </div>

      {showCurrencyReset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCurrencyReset(false);
          }}
        >
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-sm font-bold text-red-700">
              Change Home Currency
            </h3>
            <p className="mt-2 text-xs text-gray-600">
              Changing your home currency requires deleting all transactions and
              resetting your investment pool. This cannot be undone.
            </p>
            <p className="mt-2 text-xs text-gray-600">
              Export your transactions to CSV first if you need them for tax
              records.
            </p>

            <a
              href="/api/portfolio/export"
              download
              className="mt-3 inline-block rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
            >
              Export CSV before reset
            </a>

            <div className="mt-4">
              <label className="block text-xs text-gray-500">
                New home currency
              </label>
              <select
                value={pendingCurrency}
                onChange={(e) => setPendingCurrency(e.target.value)}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              >
                <option value="">Select currency...</option>
                {CURRENCIES.filter((c) => c !== homeCurrency).map((code) => (
                  <option key={code} value={code}>
                    {CURRENCY_SYMBOLS[code]} {code}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3">
              <label className="block text-xs text-gray-500">
                Type <span className="font-bold">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-red-400"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                disabled={confirmText !== "DELETE" || !pendingCurrency}
                onClick={async () => {
                  await fetch("/api/portfolio/reset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ homeCurrency: pendingCurrency }),
                  });
                  setShowCurrencyReset(false);
                  setConfirmText("");
                  setPendingCurrency("");
                  onHomeCurrencyChange(pendingCurrency);
                }}
                className="flex-1 rounded bg-red-600 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-40"
              >
                Reset & Change Currency
              </button>
              <button
                onClick={() => setShowCurrencyReset(false)}
                className="rounded px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capital pool setup */}
      <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
        {initialCapital > 0 && !editingCapital ? (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Investment pool</span>
              <button
                onClick={() => {
                  setCapitalInput(String(Math.round(initialCapital)));
                  setEditingCapital(true);
                }}
                className="text-xs text-blue-500 hover:text-blue-700"
              >
                Adjust
              </button>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-gray-400">Initial pool</p>
                <p className="font-medium text-gray-700">
                  {symbol}
                  {fmt(initialCapital)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">
                  Remaining cash
                  {remainingCash < 0 ? " (over-deployed)" : ""}
                </p>
                <p
                  className={`font-medium ${remainingCash < 0 ? "text-red-600" : "text-gray-700"}`}
                >
                  {symbol}
                  {fmt(remainingCash)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">All crypto value</p>
                <p className="font-medium text-gray-700">
                  {symbol}
                  {fmt(allCryptoValue)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Total value</p>
                <p className="font-medium text-gray-700">
                  {symbol}
                  {fmt(totalValue)}
                </p>
              </div>
            </div>
            {allCryptoValue !== cryptoValue && cryptoValue > 0 && (
              <p className="mt-1 text-xs text-gray-400">
                {assetSymbol}: {symbol}
                {fmt(cryptoValue)} of {symbol}
                {fmt(allCryptoValue)} total
              </p>
            )}
            {initialCapital > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-gray-200">
                  <div
                    className={`h-1.5 rounded-full ${totalPnl >= 0 ? "bg-green-500" : "bg-red-500"}`}
                    style={{
                      width: `${Math.min(100, Math.max(0, (totalValue / initialCapital) * 100))}%`,
                    }}
                  />
                </div>
                <span
                  className={`text-xs font-medium ${totalPnl >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {totalPnl >= 0 ? "+" : ""}
                  {symbol}
                  {fmt(Math.abs(totalPnl))} ({totalPnlPct >= 0 ? "+" : ""}
                  {totalPnlPct.toFixed(1)}%)
                </span>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-500">
              {editingCapital
                ? `Adjust investment pool (${symbol})`
                : `Set your investment pool (${symbol})`}
            </label>
            <p className="mt-0.5 text-xs text-gray-400">
              Total capital you've set aside for crypto investment
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                value={capitalInput}
                onChange={(e) => setCapitalInput(e.target.value)}
                placeholder="e.g. 10000"
                className="flex-1 rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              />
              <button
                onClick={() => {
                  const val = parseFloat(capitalInput) || 0;
                  void saveSettings({ initialCapital: val });
                  setEditingCapital(false);
                }}
                className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700"
              >
                Save
              </button>
              {editingCapital && (
                <button
                  onClick={() => setEditingCapital(false)}
                  className="rounded px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mode toggle */}
      {isBuySide && initialCapital > 0 && (
        <div className="mt-3">
          <div className="flex rounded-lg border border-gray-200 text-xs">
            <button
              onClick={() => void saveSettings({ mode: "dca" })}
              className={`flex-1 px-3 py-1.5 ${mode === "dca" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"} rounded-l-lg transition-colors`}
            >
              DCA
            </button>
            <button
              onClick={() => void saveSettings({ mode: "lump" })}
              className={`flex-1 px-3 py-1.5 ${mode === "lump" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"} rounded-r-lg transition-colors`}
            >
              Lump Sum
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            {mode === "dca"
              ? "Small buys from a limited pool — spread across many dips over time."
              : "Larger deployment from a dedicated investment fund."}
          </p>
        </div>
      )}

      {/* Buy suggestions */}
      {isBuySide && remainingCash > 0 && buyAllocs && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-500">
            Signal: <span className="font-medium">{overall.action}</span> (
            {strongBuyCount} strong, {buyCount} total buy signals)
          </p>
          <p className="text-xs text-gray-400">
            Based on remaining {symbol}
            {fmt(remainingCash)}
          </p>
          {buyAllocs.map((pct, i) => {
            const amount = remainingCash * pct;
            const cryptoAmount = amount / currentPrice;
            const buysRemaining = pct > 0 ? Math.floor(1 / pct) : Infinity;
            return (
              <div
                key={i}
                className={`rounded-lg border p-3 ${RISK_COLORS[i]}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${RISK_TEXT[i]}`}>
                    {RISK_LABELS[i]}
                  </span>
                  <span className="text-xs text-gray-500">
                    {Math.round(pct * 100)}% of remaining
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-bold text-gray-900">
                    {symbol}
                    {fmt(amount)}
                  </span>
                  <span className="text-sm text-gray-500">
                    = {fmt(cryptoAmount, assetDecimals)} {assetSymbol}
                  </span>
                </div>
                {pct === 0 ? (
                  <p className="mt-1 text-xs text-gray-400">
                    Signals don't support buying at this level
                  </p>
                ) : (
                  mode === "dca" && (
                    <p className="mt-1 text-xs text-gray-400">
                      ~{buysRemaining} buys at this size before depleted
                    </p>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {isBuySide && initialCapital > 0 && remainingCash <= 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">Pool depleted</p>
          <p className="mt-1 text-xs text-amber-600">
            Your investment pool is fully deployed. Adjust the pool amount if
            you have additional capital, or wait for sell signals to free up
            cash.
          </p>
        </div>
      )}

      {/* Sell suggestions */}
      {!isBuySide && (
        <div className="mt-4 space-y-3">
          {cryptoHoldings > 0 ? (
            <p className="text-xs text-gray-500">
              Holdings: {fmt(cryptoHoldings, assetDecimals)} {assetSymbol} (
              {symbol}
              {fmt(cryptoValue)})
            </p>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-500">
                Current {assetSymbol} holdings
              </label>
              <input
                type="number"
                value={holdingsInput}
                onChange={(e) => setHoldingsInput(e.target.value)}
                placeholder="e.g. 0.5"
                step="0.001"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400"
              />
            </div>
          )}

          {holdingsNum > 0 && sellAllocs && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Signal: <span className="font-medium">{overall.action}</span>
              </p>
              {sellAllocs.map((pct, i) => {
                const cryptoToSell = holdingsNum * pct;
                const valueInCurrency = cryptoToSell * currentPrice;
                return (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 ${RISK_COLORS[i]}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${RISK_TEXT[i]}`}>
                        {RISK_LABELS[i]}
                      </span>
                      <span className="text-xs text-gray-500">
                        {Math.round(pct * 100)}% of holdings
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-lg font-bold text-gray-900">
                        {fmt(cryptoToSell, assetDecimals)} {assetSymbol}
                      </span>
                      <span className="text-sm text-gray-500">
                        = {symbol}
                        {fmt(valueInCurrency)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-gray-400">
                Sell proceeds return to your cash pool for future buys.
              </p>
            </div>
          )}

          {!sellAllocs && (
            <p className="text-sm text-gray-500">
              No sell signals active. Hold your position.
            </p>
          )}
        </div>
      )}

      {initialCapital === 0 && (
        <p className="mt-3 text-xs text-gray-400">
          Set your investment pool above to see position sizing suggestions.
        </p>
      )}
    </div>
  );
}
