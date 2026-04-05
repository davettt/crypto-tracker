import { useState, useEffect } from "react";
import type { TaxSettings } from "../types";
import { ASSETS } from "../types";

interface Disposal {
  sellTxId: string;
  sellDate: string;
  buyTxId: string;
  buyDate: string;
  asset: string;
  amountCrypto: number;
  costBasis: number;
  proceeds: number;
  sellFee: number;
  gain: number;
  holdingDays: number;
  discountEligible: boolean;
}

interface FYSummary {
  fy: string;
  disposals: Disposal[];
  totalGains: number;
  totalLosses: number;
  netGain: number;
  discountableGains: number;
  nonDiscountableGains: number;
  discountAmount: number;
  taxableGain: number;
  estimatedTax: number;
  marginalTaxRate: number;
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function TaxReport({
  symbol,
  taxSettings,
}: {
  symbol: string;
  taxSettings: TaxSettings | undefined;
}) {
  const [fys, setFys] = useState<string[]>([]);
  const [selectedFy, setSelectedFy] = useState("");
  const [summary, setSummary] = useState<FYSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDisposals, setShowDisposals] = useState(false);

  useEffect(() => {
    void fetch("/api/tax/fys")
      .then((r) => r.json())
      .then((data) => {
        const fyList: string[] = data.fys ?? [];
        setFys(fyList);
        if (fyList.length > 0) {
          const defaultFy = fyList[fyList.length - 1] ?? "";
          setSelectedFy(defaultFy);
          // Fetch summary for initial FY
          void fetch(`/api/tax/summary?fy=${defaultFy}`)
            .then((r2) => r2.json())
            .then((s) => setSummary(s));
        }
      });
  }, []);

  function handleFyChange(fy: string) {
    setSelectedFy(fy);
    if (!fy) return;
    setLoading(true);
    void fetch(`/api/tax/summary?fy=${fy}`)
      .then((r) => r.json())
      .then((data) => {
        setSummary(data);
        setLoading(false);
      });
  }

  if (fys.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Tax Report
        </h3>
        <p className="mt-3 text-sm text-gray-400">
          No sell transactions yet — tax report will appear after your first
          sale.
        </p>
      </div>
    );
  }

  const rate = (taxSettings?.marginalTaxRate ?? 0.325) * 100;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Australian Tax Report
          </h3>
          <p className="text-xs text-gray-400">All assets combined</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedFy}
            onChange={(e) => handleFyChange(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
          >
            {fys.map((fy) => (
              <option key={fy} value={fy}>
                FY {fy}
              </option>
            ))}
          </select>
          {selectedFy && (
            <a
              href={`/api/tax/export?fy=${selectedFy}`}
              download
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              Export CSV
            </a>
          )}
        </div>
      </div>

      {loading && <p className="mt-3 text-sm text-gray-400">Loading...</p>}

      {summary && !loading && (
        <div className="mt-4 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500">Total Gains</p>
              <p className="text-sm font-bold text-green-600">
                {symbol}
                {fmt(summary.totalGains)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Losses</p>
              <p className="text-sm font-bold text-red-600">
                -{symbol}
                {fmt(summary.totalLosses)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Net Gain</p>
              <p
                className={`text-sm font-bold ${summary.netGain >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {summary.netGain >= 0 ? "" : "-"}
                {symbol}
                {fmt(Math.abs(summary.netGain))}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">CGT Discount</p>
              <p className="text-sm font-bold text-blue-600">
                -{symbol}
                {fmt(summary.discountAmount)}
              </p>
            </div>
          </div>

          {/* Tax calculation */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Taxable Capital Gain</p>
                <p className="text-lg font-bold text-gray-900">
                  {symbol}
                  {fmt(Math.max(0, summary.taxableGain))}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Estimated Tax ({rate}%)</p>
                <p className="text-lg font-bold text-orange-600">
                  {symbol}
                  {fmt(summary.estimatedTax)}
                </p>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              <p>
                50% CGT discount applied to gains on assets held &gt;12 months.
              </p>
              <p>Based on Australian tax rules. Not financial advice.</p>
            </div>
          </div>

          {/* Disposals */}
          {summary.disposals.length > 0 && (
            <div>
              <button
                onClick={() => setShowDisposals((v) => !v)}
                className="text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                {showDisposals ? "Hide" : "Show"} disposals (
                {summary.disposals.length}) {showDisposals ? "▾" : "▸"}
              </button>

              {showDisposals && (
                <div className="mt-2 max-h-60 overflow-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="border-b border-gray-200">
                        <th className="px-2 py-1.5 text-gray-500">Sold</th>
                        <th className="px-2 py-1.5 text-gray-500">Bought</th>
                        <th className="px-2 py-1.5 text-gray-500">Asset</th>
                        <th className="px-2 py-1.5 text-right text-gray-500">
                          Amount
                        </th>
                        <th className="px-2 py-1.5 text-right text-gray-500">
                          Cost
                        </th>
                        <th className="px-2 py-1.5 text-right text-gray-500">
                          Proceeds
                        </th>
                        <th className="px-2 py-1.5 text-right text-gray-500">
                          Gain
                        </th>
                        <th className="px-2 py-1.5 text-gray-500">Days</th>
                        <th className="px-2 py-1.5 text-gray-500">CGT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {summary.disposals.map((d, i) => {
                        const assetCfg = ASSETS[d.asset as keyof typeof ASSETS];
                        return (
                          <tr key={i}>
                            <td className="px-2 py-1 text-gray-700">
                              {d.sellDate}
                            </td>
                            <td className="px-2 py-1 text-gray-700">
                              {d.buyDate}
                            </td>
                            <td className="px-2 py-1 text-gray-700">
                              {assetCfg?.symbol ?? d.asset}
                            </td>
                            <td className="px-2 py-1 text-right text-gray-700">
                              {d.amountCrypto.toPrecision(6)}
                            </td>
                            <td className="px-2 py-1 text-right text-gray-700">
                              {symbol}
                              {fmt(d.costBasis, 2)}
                            </td>
                            <td className="px-2 py-1 text-right text-gray-700">
                              {symbol}
                              {fmt(d.proceeds, 2)}
                            </td>
                            <td
                              className={`px-2 py-1 text-right font-medium ${d.gain >= 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              {d.gain >= 0 ? "+" : ""}
                              {symbol}
                              {fmt(d.gain, 2)}
                            </td>
                            <td className="px-2 py-1 text-gray-500">
                              {d.holdingDays}
                            </td>
                            <td className="px-2 py-1">
                              {d.discountEligible ? (
                                <span className="text-blue-500">50%</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {summary.disposals.length === 0 && (
            <p className="text-sm text-gray-400">
              No sells recorded in FY {summary.fy} — capital gains tax only
              applies when you sell or dispose of an asset.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
