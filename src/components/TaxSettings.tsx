import { useState } from "react";
import type { TaxSettings as TaxSettingsType } from "../types";

const MARGINAL_RATES = [
  { label: "0% (Tax-free threshold)", value: 0 },
  { label: "19% ($18,201 – $45,000)", value: 0.19 },
  { label: "32.5% ($45,001 – $120,000)", value: 0.325 },
  { label: "37% ($120,001 – $180,000)", value: 0.37 },
  { label: "45% ($180,001+)", value: 0.45 },
];

export default function TaxSettings({
  settings,
  onSave,
}: {
  settings: TaxSettingsType | undefined;
  onSave: (s: TaxSettingsType) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(settings?.marginalTaxRate ?? 0.325);
  const [feeRate, setFeeRate] = useState(
    String((settings?.exchangeFeeRate ?? 0.006) * 100),
  );

  async function handleSave() {
    const taxSettings: TaxSettingsType = {
      marginalTaxRate: rate,
      exchangeFeeRate: parseFloat(feeRate) / 100 || 0.006,
    };
    await fetch("/api/portfolio/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxSettings }),
    });
    onSave(taxSettings);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Tax Settings ({(settings?.marginalTaxRate ?? 0.325) * 100}% rate,{" "}
        {((settings?.exchangeFeeRate ?? 0.006) * 100).toFixed(1)}% fee)
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Tax Settings
      </h4>
      <div className="mt-3 space-y-3">
        <div>
          <label className="block text-xs text-gray-500">
            Marginal Tax Rate
          </label>
          <select
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          >
            {MARGINAL_RATES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500">
            Exchange Fee Rate (%)
          </label>
          <input
            type="number"
            value={feeRate}
            onChange={(e) => setFeeRate(e.target.value)}
            step="0.1"
            className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          />
          <p className="mt-0.5 text-xs text-gray-400">
            This is the trading fee your exchange charges per transaction. Check
            your exchange&apos;s fee schedule — common AU rates: CoinSpot 0.6%,
            Swyftx 0.6%, Independent Reserve 0.5%, Kraken 0.25%, Revolut (free
            plan) 1.49%.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void handleSave()}
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700"
          >
            Save
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
