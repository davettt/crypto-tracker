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

/**
 * Calculate target sell price for a desired net gain percentage.
 * Formula accounts for exchange fees and tax.
 *
 * For a sell at price P:
 *   proceeds = holdings * P
 *   sellFee = proceeds * feeRate
 *   netProceeds = proceeds - sellFee
 *   gain = netProceeds - costBasis
 *   tax = gain * effectiveTaxRate (if gain > 0)
 *   netGain = gain - tax
 *   desiredNetGain = costBasis * targetPct
 *
 * Solving for P:
 *   P = costBasis * (1 + targetPct / (1 - effectiveTaxRate)) / (holdings * (1 - feeRate))
 */
function calcTargetPrice(
  avgCost: number,
  feeRate: number,
  effectiveTaxRate: number,
  targetNetPct: number,
): number {
  if (effectiveTaxRate >= 1) return Infinity;
  return (
    (avgCost * (1 + targetNetPct / (1 - effectiveTaxRate))) / (1 - feeRate)
  );
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
  let shortTermCost = 0;
  let shortTermHoldings = 0;
  let longTermCost = 0;
  let longTermHoldings = 0;

  for (const lot of openLots) {
    const buyDate = new Date(lot.date);
    const holdingDays = Math.floor(
      (now.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const remainingCost = lot.costBasis * (lot.remaining / lot.amountCrypto);
    if (holdingDays > 365) {
      longTermHoldings += lot.remaining;
      longTermCost += remainingCost;
    } else {
      shortTermHoldings += lot.remaining;
      shortTermCost += remainingCost;
    }
  }

  const shortTermAvg =
    shortTermHoldings > 0 ? shortTermCost / shortTermHoldings : 0;
  const longTermAvg =
    longTermHoldings > 0 ? longTermCost / longTermHoldings : 0;

  const longTermTaxRate = marginalRate * 0.5; // 50% CGT discount
  const shortTermTaxRate = marginalRate;

  const targets = [0.15, 0.2, 0.25, 0.3];

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

      <div className="mt-4 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="pb-2 text-gray-500">Net Gain</th>
              {shortTermHoldings > 0 && (
                <th className="pb-2 text-right text-gray-500">
                  Short-term
                  <span className="ml-1 text-gray-400">
                    ({(shortTermTaxRate * 100).toFixed(1)}% tax)
                  </span>
                </th>
              )}
              {longTermHoldings > 0 && (
                <th className="pb-2 text-right text-gray-500">
                  Long-term
                  <span className="ml-1 text-gray-400">
                    ({(longTermTaxRate * 100).toFixed(1)}% tax)
                  </span>
                </th>
              )}
              <th className="pb-2 text-right text-gray-500">Combined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {targets.map((pct) => {
              const shortTarget =
                shortTermHoldings > 0
                  ? calcTargetPrice(
                      shortTermAvg,
                      feeRate,
                      shortTermTaxRate,
                      pct,
                    )
                  : 0;
              const longTarget =
                longTermHoldings > 0
                  ? calcTargetPrice(longTermAvg, feeRate, longTermTaxRate, pct)
                  : 0;
              const combinedTarget = calcTargetPrice(
                avgCost,
                feeRate,
                // Weighted average effective tax rate
                totalRemaining > 0
                  ? (shortTermHoldings * shortTermTaxRate +
                      longTermHoldings * longTermTaxRate) /
                      totalRemaining
                  : shortTermTaxRate,
                pct,
              );

              const combinedAboveCurrent = combinedTarget > currentPrice;

              return (
                <tr key={pct}>
                  <td className="py-2 font-medium text-gray-700">
                    +{(pct * 100).toFixed(0)}%
                  </td>
                  {shortTermHoldings > 0 && (
                    <td
                      className={`py-2 text-right ${shortTarget > currentPrice ? "text-gray-700" : "text-green-600 font-medium"}`}
                    >
                      {symbol}
                      {fmt(shortTarget)}
                    </td>
                  )}
                  {longTermHoldings > 0 && (
                    <td
                      className={`py-2 text-right ${longTarget > currentPrice ? "text-gray-700" : "text-green-600 font-medium"}`}
                    >
                      {symbol}
                      {fmt(longTarget)}
                    </td>
                  )}
                  <td
                    className={`py-2 text-right font-medium ${combinedAboveCurrent ? "text-gray-900" : "text-green-600"}`}
                  >
                    {symbol}
                    {fmt(combinedTarget)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
        {shortTermHoldings > 0 && (
          <span>
            Short-term: {shortTermHoldings.toPrecision(6)} {assetConfig.symbol}{" "}
            (avg {symbol}
            {fmt(shortTermAvg)})
          </span>
        )}
        {longTermHoldings > 0 && (
          <span>
            Long-term: {longTermHoldings.toPrecision(6)} {assetConfig.symbol}{" "}
            (avg {symbol}
            {fmt(longTermAvg)})
          </span>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-400">
        Target prices factor in {(feeRate * 100).toFixed(1)}% exchange fee +
        CGT. Green = already achievable at current price.
      </p>
    </div>
  );
}
