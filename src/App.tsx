import { useEffect, useState, useCallback, useRef } from "react";
import { useMarketStore } from "./stores/marketStore";
import type { Transaction, PortfolioSettings } from "./types";
import { CURRENCIES, CURRENCY_SYMBOLS } from "./types";
import PriceHeader from "./components/PriceHeader";
import SignalPanel from "./components/SignalPanel";
import PriceChart from "./components/PriceChart";
import RsiChart from "./components/RsiChart";
import PositionCalculator from "./components/PositionCalculator";
import PortfolioTracker from "./components/PortfolioTracker";

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
    overview,
    chartData,
    loading,
    error,
    homeCurrency,
    displayCurrency,
    setDisplayCurrency,
    setHomeCurrency,
    fetchOverview,
    fetchChart,
  } = useMarketStore();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<PortfolioSettings | null>(null);
  const didInit = useRef(false);

  const reloadPortfolio = useCallback(() => {
    void fetchPortfolio().then((data) => {
      setTransactions(data.transactions ?? []);
      setSettings(data.settings);
    });
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void fetchOverview();
    void fetchChart();
    void fetchPortfolio().then((data) => {
      setTransactions(data.transactions ?? []);
      setSettings(data.settings);
    });
  }, [fetchOverview, fetchChart]);

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
            <h1 className="text-lg font-bold text-gray-900">
              BTC Market Tracker
            </h1>
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
                  void fetchOverview();
                  void fetchChart();
                }}
                disabled={loading}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>
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
            />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {chartData && (
                  <>
                    <PriceChart
                      data={chartData}
                      displayCurrency={displayCurrency}
                      exchangeRates={overview.exchangeRates}
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
                transactions={transactions}
                settings={settings}
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
                onTransactionsChange={reloadPortfolio}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
