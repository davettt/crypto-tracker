import { useState, useEffect } from "react";
import type { AssetId, TaxSettings, Transaction } from "../types";
import { ASSETS } from "../types";

interface OpenLot {
  buyTxId: string;
  date: string;
  amountCrypto: number;
  costBasis: number;
  remaining: number;
  pricePerUnit: number;
}

interface CostBasisData {
  openLots: OpenLot[];
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function calcNetPerUnit(
  avgCost: number,
  sellPrice: number,
  feeRate: number,
  effectiveTaxRate: number,
): number {
  const afterFee = sellPrice * (1 - feeRate);
  const gain = afterFee - avgCost;
  const tax = gain > 0 ? gain * effectiveTaxRate : 0;
  return afterFee - tax;
}

export default function TargetCalculator({
  activeAsset,
  currentPrice,
  symbol,
  taxSettings,
  transactions,
}: {
  activeAsset: AssetId;
  currentPrice: number;
  symbol: string;
  taxSettings: TaxSettings | undefined;
  transactions: Transaction[];
}) {
  const [costBasis, setCostBasis] = useState<CostBasisData | null>(null);
  const assetConfig = ASSETS[activeAsset];

  const feeRate = taxSettings?.exchangeFeeRate ?? 0.006;
  const marginalRate = taxSettings?.marginalTaxRate ?? 0.325;

  useEffect(() => {
    void fetch(`/api/tax/costbasis?asset=${activeAsset}`)
      .then((r) => r.json())
      .then((data) => setCostBasis(data));
  }, [activeAsset, transactions]);

  const openLots = costBasis?.openLots ?? [];
  if (openLots.length === 0) {
    return null;
  }

  const totalRemaining = openLots.reduce((s, l) => s + l.remaining, 0);
  const totalCostBasis = openLots.reduce(
    (s, l) => s + l.costBasis * (l.remaining / l.amountCrypto),
    0,
  );
  const avgCost = totalRemaining > 0 ? totalCostBasis / totalRemaining : 0;

  // Separate short-term (<365 days) and long-term lots
  const now = new Date();
  let shortTermHoldings = 0;
  let longTermHoldings = 0;

  for (const lot of openLots) {
    const buyDate = new Date(lot.date);
    const holdingDays = Math.floor(
      (now.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (holdingDays > 365) {
      longTermHoldings += lot.remaining;
    } else {
      shortTermHoldings += lot.remaining;
    }
  }

  const longTermTaxRate = marginalRate * 0.5; // 50% CGT discount
  const shortTermTaxRate = marginalRate;

  const multiples = [1.5, 2, 2.5];

  const breakEven = avgCost / (1 - feeRate);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        {assetConfig.symbol} Target Sell Prices
      </h3>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>
          Avg cost: {symbol}
          {fmt(avgCost)}/{assetConfig.symbol}
        </span>
        <span>
          Break-even: {symbol}
          {fmt(breakEven)}
        </span>
        <span>
          Current: {symbol}
          {fmt(currentPrice)}
        </span>
      </div>

      {[
        {
          label: `Long-term (${(longTermTaxRate * 100).toFixed(1)}% CGT)`,
          taxRate: longTermTaxRate,
          holdings: longTermHoldings,
        },
        {
          label: `Short-term (${(shortTermTaxRate * 100).toFixed(1)}% CGT)`,
          taxRate: shortTermTaxRate,
          holdings: shortTermHoldings,
        },
      ]
        .filter((t) => t.holdings > 0)
        .map((tier) => (
          <div key={tier.label} className="mt-4 overflow-auto">
            <p className="mb-1 text-xs font-medium text-gray-500">
              {tier.label} — {tier.holdings.toPrecision(4)} {assetConfig.symbol}
            </p>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-2 text-gray-500">Target</th>
                  <th className="pb-2 text-right text-gray-500">Sell Price</th>
                  <th className="pb-2 text-right text-gray-500">Net/unit</th>
                  <th className="pb-2 text-right text-gray-500">Profit/unit</th>
                  <th className="pb-2 text-right text-gray-500">
                    Total Profit
                  </th>
                  <th className="pb-2 text-right text-gray-500">Gain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {multiples.map((mult) => {
                  const sellPrice = avgCost * mult;
                  const net = calcNetPerUnit(
                    avgCost,
                    sellPrice,
                    feeRate,
                    tier.taxRate,
                  );
                  const profit = net - avgCost;
                  const totalProfit = profit * tier.holdings;
                  const netGainPct = (profit / avgCost) * 100;
                  const aboveCurrent = sellPrice > currentPrice;

                  return (
                    <tr key={mult}>
                      <td className="py-2 font-medium text-gray-700">
                        {mult}x
                      </td>
                      <td
                        className={`py-2 text-right ${aboveCurrent ? "text-gray-700" : "text-green-600 font-medium"}`}
                      >
                        {symbol}
                        {fmt(sellPrice)}
                      </td>
                      <td className="py-2 text-right text-gray-700">
                        {symbol}
                        {fmt(net)}
                      </td>
                      <td className="py-2 text-right text-gray-700">
                        {symbol}
                        {fmt(profit)}
                      </td>
                      <td className="py-2 text-right text-gray-700">
                        {symbol}
                        {fmt(totalProfit)}
                      </td>
                      <td
                        className={`py-2 text-right font-medium ${aboveCurrent ? "text-gray-900" : "text-green-600"}`}
                      >
                        +{fmt(netGainPct)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      <p className="mt-3 text-xs text-gray-400">
        Based on avg cost {symbol}
        {fmt(avgCost)}/{assetConfig.symbol}. Net factors in{" "}
        {(feeRate * 100).toFixed(1)}% exchange fee + CGT. Green = already above
        current price.
      </p>
    </div>
  );
}
