import { useEffect, useState, useCallback, useRef } from "react";
import { useMarketStore } from "./stores/marketStore";
import type { Transaction, PortfolioSettings, AssetId } from "./types";
import { ASSETS, ASSET_LIST, CURRENCIES, CURRENCY_SYMBOLS } from "./types";
import PriceHeader from "./components/PriceHeader";
import SignalPanel from "./components/SignalPanel";
import PriceChart from "./components/PriceChart";
import RsiChart from "./components/RsiChart";
import PositionCalculator from "./components/PositionCalculator";
import PortfolioTracker from "./components/PortfolioTracker";
import TaxSettings from "./components/TaxSettings";
import TaxReport from "./components/TaxReport";
import TargetCalculator from "./components/TargetCalculator";

interface PortfolioData {
  settings: PortfolioSettings;
  transactions: Transaction[];
}

async function fetchPortfolio(): Promise<PortfolioData> {
  const res = await fetch("/api/portfolio");
  return res.json();
}

export default function App() {
  const {
    overviewByAsset,
    chartByAsset,
    activeAsset,
    setActiveAsset,
    loading,
    error,
    homeCurrency,
    displayCurrency,
    setDisplayCurrency,
    setHomeCurrency,
    fetchOverview,
    fetchChart,
  } = useMarketStore();

  const overview = overviewByAsset[activeAsset] ?? null;
  const chartData = chartByAsset[activeAsset] ?? null;

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<PortfolioSettings | null>(null);
  const didInit = useRef(false);

  // Filter transactions for active asset
  const transactions = allTransactions.filter(
    (t) => (t.asset ?? "bitcoin") === activeAsset,
  );

  const reloadPortfolio = useCallback(() => {
    void fetchPortfolio().then((data) => {
      setAllTransactions(data.transactions ?? []);
      setSettings(data.settings);
    });
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void fetchOverview();
    void fetchChart();
    void fetchPortfolio().then((data) => {
      setAllTransactions(data.transactions ?? []);
      setSettings(data.settings);
    });
  }, [fetchOverview, fetchChart]);

  // Fetch data when switching assets (if not cached)
  function handleAssetChange(assetId: AssetId) {
    setActiveAsset(assetId);
    if (!overviewByAsset[assetId]) {
      void fetchOverview(assetId);
    }
    if (!chartByAsset[assetId]) {
      void fetchChart(assetId);
    }
  }

  async function changeHomeCurrency(newCurrency: string) {
    await fetch("/api/portfolio/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeCurrency: newCurrency }),
    });
    setHomeCurrency(newCurrency as Parameters<typeof setHomeCurrency>[0]);
    reloadPortfolio();
    void fetchOverview();
  }

  const homeSymbol = CURRENCY_SYMBOLS[homeCurrency] ?? "$";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">Crypto Tracker</h1>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-400">View in</label>
                <select
                  value={displayCurrency}
                  onChange={(e) =>
                    setDisplayCurrency(
                      e.target.value as Parameters<
                        typeof setDisplayCurrency
                      >[0],
                    )
                  }
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-blue-400"
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {CURRENCY_SYMBOLS[code]} {code}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  void fetchOverview(undefined, true);
                  void fetchChart(undefined, true);
                }}
                disabled={loading}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          {/* Asset tabs */}
          <div className="mt-3 flex gap-1">
            {ASSET_LIST.map((id) => {
              const cfg = ASSETS[id];
              const isActive = id === activeAsset;
              return (
                <button
                  key={id}
                  onClick={() => handleAssetChange(id)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {cfg.symbol}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && !overview && (
          <div className="py-20 text-center text-gray-400">
            Loading market data...
          </div>
        )}

        {overview && (
          <div className="space-y-6">
            <PriceHeader
              data={overview.current}
              displayCurrency={displayCurrency}
              homeCurrency={homeCurrency}
              exchangeRates={overview.exchangeRates}
              activeAsset={activeAsset}
            />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {chartData && (
                  <>
                    <PriceChart
                      data={chartData}
                      displayCurrency={displayCurrency}
                      exchangeRates={overview.exchangeRates}
                      activeAsset={activeAsset}
                      currentPriceUsd={overview.current.priceUsd}
                    />
                    <RsiChart data={chartData} />
                  </>
                )}
              </div>
              <div className="space-y-6">
                <SignalPanel
                  signals={overview.signals}
                  overall={overview.overall}
                  fearGreed={overview.fearGreed}
                />
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <PositionCalculator
                overall={overview.overall}
                signals={overview.signals}
                currentPrice={overview.current.price}
                homeCurrency={homeCurrency}
                symbol={homeSymbol}
                transactions={allTransactions}
                settings={settings}
                activeAsset={activeAsset}
                overviewByAsset={overviewByAsset}
                onSettingsChange={() => {
                  reloadPortfolio();
                  void fetchOverview();
                }}
                onHomeCurrencyChange={changeHomeCurrency}
              />
              <PortfolioTracker
                currentPrice={overview.current.price}
                homeCurrency={homeCurrency}
                symbol={homeSymbol}
                overall={overview.overall}
                signals={overview.signals}
                transactions={transactions}
                activeAsset={activeAsset}
                onTransactionsChange={reloadPortfolio}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <TargetCalculator
                activeAsset={activeAsset}
                currentPrice={overview.current.price}
                symbol={homeSymbol}
                taxSettings={settings?.taxSettings}
                transactions={transactions}
              />
              <TaxReport
                symbol={homeSymbol}
                taxSettings={settings?.taxSettings}
              />
            </div>

            <TaxSettings
              settings={settings?.taxSettings}
              onSave={() => {
                reloadPortfolio();
              }}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
        <div className="mx-auto max-w-6xl px-4">
          <p>
            Not financial or tax advice. All signals are algorithmic and may not
            reflect current market conditions. Tax calculations are estimates
            based on simplified Australian tax rules — do not rely on them for
            tax reporting. Always consult a qualified financial adviser and tax
            professional. Use at your own risk.
          </p>
        </div>
      </footer>
    </div>
  );
}
