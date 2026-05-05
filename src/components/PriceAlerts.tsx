import { useState, useEffect, useRef } from "react";
import type { AssetId, Currency } from "../types";
import { CURRENCY_SYMBOLS } from "../types";

interface PriceAlert {
  price: number;
  direction: "below" | "above";
  note: string;
  triggered: boolean;
}

type AllPriceAlerts = Record<string, PriceAlert[]>;

export default function PriceAlerts({
  activeAsset,
  homeCurrency,
}: {
  activeAsset: AssetId;
  homeCurrency: Currency;
}) {
  const [all, setAll] = useState<AllPriceAlerts>({});
  const [adding, setAdding] = useState(false);
  const [draftPrice, setDraftPrice] = useState("");
  const [draftDir, setDraftDir] = useState<"below" | "above">("below");
  const [draftNote, setDraftNote] = useState("");
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/alerts/price-alerts")
      .then((r) => r.json())
      .then(setAll)
      .catch(() => {});
  }, []);

  const alerts = all[activeAsset] ?? [];
  const sym = CURRENCY_SYMBOLS[homeCurrency] ?? "$";

  const save = async (updated: PriceAlert[]) => {
    const next = { ...all };
    if (updated.length === 0) {
      setAll(
        Object.fromEntries(
          Object.entries(next).filter(([k]) => k !== activeAsset),
        ),
      );
    } else {
      next[activeAsset] = updated;
      setAll(next);
    }
    await fetch(`/api/alerts/price-alerts/${activeAsset}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alerts: updated }),
    });
  };

  const handleAdd = () => {
    const p = parseFloat(draftPrice);
    if (!p || p <= 0) return;
    const updated = [
      ...alerts,
      {
        price: p,
        direction: draftDir,
        note: draftNote.trim(),
        triggered: false,
      },
    ];
    setDraftPrice("");
    setDraftNote("");
    setAdding(false);
    void save(updated);
  };

  const handleRemove = (idx: number) => {
    void save(alerts.filter((_, i) => i !== idx));
  };

  const handleReset = (idx: number) => {
    const updated = alerts.map((a, i) =>
      i === idx ? { ...a, triggered: false } : a,
    );
    void save(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
    if (e.key === "Escape") setAdding(false);
  };

  const startAdding = () => {
    setAdding(true);
    setTimeout(() => priceRef.current?.focus(), 0);
  };

  return (
    <div className="mt-2 text-xs text-gray-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {alerts.map((a, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
              a.triggered
                ? "bg-amber-50 text-amber-600 line-through"
                : a.direction === "below"
                  ? "bg-green-50 text-green-600"
                  : "bg-red-50 text-red-600"
            }`}
          >
            {a.direction === "below" ? "≤" : "≥"} {sym}
            {a.price.toLocaleString()}
            {a.note && (
              <span className="text-gray-400" title={a.note}>
                ({a.note})
              </span>
            )}
            {a.triggered && (
              <button
                onClick={() => handleReset(i)}
                className="ml-0.5 text-amber-500 hover:text-amber-700"
                title="Re-arm alert"
              >
                &#x21bb;
              </button>
            )}
            <button
              onClick={() => handleRemove(i)}
              className="ml-0.5 text-gray-300 hover:text-red-500"
              title="Remove"
            >
              &times;
            </button>
          </span>
        ))}

        {adding ? (
          <span className="inline-flex items-center gap-1">
            <select
              value={draftDir}
              onChange={(e) => setDraftDir(e.target.value as "below" | "above")}
              className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs outline-none"
            >
              <option value="below">Below</option>
              <option value="above">Above</option>
            </select>
            <span>{sym}</span>
            <input
              ref={priceRef}
              type="number"
              value={draftPrice}
              onChange={(e) => setDraftPrice(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Price"
              className="w-20 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs outline-none focus:border-blue-400"
              step="any"
              min="0"
            />
            <input
              type="text"
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Note (optional)"
              className="w-28 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs outline-none focus:border-blue-400"
            />
            <button
              onClick={handleAdd}
              className="rounded bg-gray-800 px-2 py-0.5 text-xs text-white hover:bg-gray-600"
            >
              Add
            </button>
            <button
              onClick={() => setAdding(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>
          </span>
        ) : (
          <button
            onClick={startAdding}
            className="text-gray-400 hover:text-gray-600"
          >
            + Price alert
          </button>
        )}
      </div>
    </div>
  );
}
