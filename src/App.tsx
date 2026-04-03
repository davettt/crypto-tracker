import { useEffect, useState, useCallback, useRef } from "react";
import { useMarketStore } from "./stores/marketStore";
import type { Transaction } from "./types";
import PriceHeader from "./components/PriceHeader";
import SignalPanel from "./components/SignalPanel";
import PriceChart from "./components/PriceChart";
import RsiChart from "./components/RsiChart";
import PositionCalculator from "./components/PositionCalculator";
import PortfolioTracker from "./components/PortfolioTracker";

async function fetchTransactions(): Promise<Transaction[]> {
  const res = await fetch("/api/portfolio");
  const data = await res.json();
  return data.transactions ?? [];
}

export default function App() {
  const {
    overview,
    chartData,
    loading,
    error,
    currency,
    setCurrency,
    fetchOverview,
    fetchChart,
  } = useMarketStore();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const didInit = useRef(false);

  const reloadTransactions = useCallback(() => {
    void fetchTransactions().then(setTransactions);
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void fetchOverview();
    void fetchChart();
    void fetchTransactions().then(setTransactions);
  }, [fetchOverview, fetchChart]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">
              BTC Market Tracker
            </h1>
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg border border-gray-200 text-sm">
                <button
                  onClick={() => setCurrency("USD")}
                  className={`px-3 py-1.5 ${currency === "USD" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"} rounded-l-lg transition-colors`}
                >
                  USD
                </button>
                <button
                  onClick={() => setCurrency("AUD")}
                  className={`px-3 py-1.5 ${currency === "AUD" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"} rounded-r-lg transition-colors`}
                >
                  AUD
                </button>
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
              exchangeRate={overview.exchangeRate}
              currency={currency}
            />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {chartData && (
                  <>
                    <PriceChart
                      data={chartData}
                      currency={currency}
                      exchangeRate={overview.exchangeRate}
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
                <PositionCalculator
                  overall={overview.overall}
                  signals={overview.signals}
                  currentPrice={overview.current.price}
                  currency={currency}
                  exchangeRate={overview.exchangeRate}
                  transactions={transactions}
                  onSettingsChange={() => void reloadTransactions()}
                />
                <PortfolioTracker
                  currentPrice={overview.current.price}
                  currency={currency}
                  exchangeRate={overview.exchangeRate}
                  overall={overview.overall}
                  signals={overview.signals}
                  transactions={transactions}
                  onTransactionsChange={() => void reloadTransactions()}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
