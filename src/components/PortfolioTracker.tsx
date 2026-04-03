import { useState } from "react";
import type {
  Transaction,
  Currency,
  ExchangeRate,
  Overall,
  Signal,
} from "../types";

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function buildDefaultNote(overall: Overall, signals: Signal[]) {
  const buySigs = signals.filter((s) => s.type === "buy");
  const sellSigs = signals.filter((s) => s.type === "sell");
  const strongBuys = buySigs.filter((s) => s.strength === "strong");
  const strongSells = sellSigs.filter((s) => s.strength === "strong");

  const parts: string[] = [`Signal: ${overall.action}`];

  if (strongBuys.length > 0) {
    parts.push(`Strong: ${strongBuys.map((s) => s.indicator).join(", ")}`);
  }
  if (buySigs.length > strongBuys.length) {
    const moderate = buySigs.filter((s) => s.strength === "moderate");
    if (moderate.length > 0) {
      parts.push(`Moderate: ${moderate.map((s) => s.indicator).join(", ")}`);
    }
  }
  if (strongSells.length > 0) {
    parts.push(
      `Sell signals: ${strongSells.map((s) => s.indicator).join(", ")}`,
    );
  }

  return parts.join(". ");
}

function AddTransactionForm({
  currentPrice,
  currency,
  exchangeRate,
  overall,
  signals,
  onAdd,
}: {
  currentPrice: number;
  currency: Currency;
  exchangeRate: ExchangeRate;
  overall: Overall;
  signals: Signal[];
  onAdd: () => void;
}) {
  const [type, setType] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);

  const rate = currency === "AUD" ? exchangeRate.usdToAud : 1;
  const symbol = currency === "AUD" ? "A$" : "$";
  const priceInCurrency = currentPrice * rate;

  const amountNum = parseFloat(amount) || 0;
  const feeNum = parseFloat(fee) || 0;
  const priceNum = parseFloat(price) || priceInCurrency;
  // For buys: fee reduces the amount that goes to BTC
  // For sells: fee reduces the cash received
  const effectiveAmount = type === "buy" ? amountNum - feeNum : amountNum;
  const btcAmount = priceNum > 0 ? effectiveAmount / priceNum : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountNum <= 0) return;

    const priceUsd = currency === "AUD" ? priceNum / rate : priceNum;
    const feeUsd = currency === "AUD" ? feeNum / rate : feeNum;

    await fetch("/api/portfolio/transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        amountUsd: amountNum / rate,
        amountBtc: btcAmount,
        priceUsd,
        feeUsd,
        feeLocal: feeNum,
        currency,
        amountLocal: amountNum,
        date,
        notes,
      }),
    });

    setAmount("");
    setFee("");
    setPrice("");
    setNotes("");
    setOpen(false);
    onAdd();
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setNotes(buildDefaultNote(overall, signals));
          setOpen(true);
        }}
        className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
      >
        + Record transaction
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setType("buy")}
          className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${type === "buy" ? "bg-green-600 text-white" : "bg-white text-gray-500"}`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setType("sell")}
          className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${type === "sell" ? "bg-red-600 text-white" : "bg-white text-gray-500"}`}
        >
          Sell
        </button>
      </div>
      <div>
        <label className="block text-xs text-gray-500">
          Amount spent/received ({symbol})
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 500"
          className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          required
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500">Fee ({symbol})</label>
        <input
          type="number"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          placeholder="0"
          step="0.01"
          className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500">
          Price per BTC ({symbol}) — defaults to current
        </label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={fmt(priceInCurrency)}
          step="0.01"
          className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        />
      </div>
      {amountNum > 0 && (
        <div className="rounded bg-white p-2 text-xs text-gray-500">
          {type === "buy" ? (
            <>
              <p>
                {symbol}
                {fmt(amountNum)} - {symbol}
                {fmt(feeNum)} fee = {symbol}
                {fmt(effectiveAmount)} invested
              </p>
              <p className="font-medium">
                = {fmt(btcAmount, 8)} BTC at {symbol}
                {fmt(priceNum)}/BTC
              </p>
            </>
          ) : (
            <>
              <p>
                {fmt(btcAmount, 8)} BTC at {symbol}
                {fmt(priceNum)}/BTC
              </p>
              <p className="font-medium">
                = {symbol}
                {fmt(amountNum)} - {symbol}
                {fmt(feeNum)} fee = {symbol}
                {fmt(amountNum - feeNum)} received
              </p>
            </>
          )}
        </div>
      )}
      <div>
        <label className="block text-xs text-gray-500">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500">Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. DCA during dip"
          className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-gray-900 py-2 text-sm text-white hover:bg-gray-700"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function PortfolioTracker({
  currentPrice,
  currency,
  exchangeRate,
  overall,
  signals,
  transactions,
  onTransactionsChange,
}: {
  currentPrice: number;
  currency: Currency;
  exchangeRate: ExchangeRate;
  overall: Overall;
  signals: Signal[];
  transactions: Transaction[];
  onTransactionsChange: () => void;
}) {
  const rate = currency === "AUD" ? exchangeRate.usdToAud : 1;
  const symbol = currency === "AUD" ? "A$" : "$";

  async function deleteTransaction(id: string) {
    await fetch(`/api/portfolio/transaction/${id}`, { method: "DELETE" });
    onTransactionsChange();
  }

  // Calculate portfolio stats
  const buys = transactions.filter((t) => t.type === "buy");
  const sells = transactions.filter((t) => t.type === "sell");
  const totalBoughtBtc = buys.reduce((s, t) => s + t.amountBtc, 0);
  const totalSoldBtc = sells.reduce((s, t) => s + t.amountBtc, 0);
  const holdingsBtc = totalBoughtBtc - totalSoldBtc;
  const totalInvestedUsd = buys.reduce((s, t) => s + t.amountUsd, 0);
  const totalReceivedUsd = sells.reduce((s, t) => s + t.amountUsd, 0);
  const totalFeesUsd = transactions.reduce((s, t) => s + (t.feeUsd ?? 0), 0);

  const currentValueUsd = holdingsBtc * currentPrice;
  const netCostUsd = totalInvestedUsd - totalReceivedUsd;
  const pnlUsd = currentValueUsd - netCostUsd;
  const pnlPct = netCostUsd > 0 ? (pnlUsd / netCostUsd) * 100 : 0;
  const avgCostUsd = totalBoughtBtc > 0 ? totalInvestedUsd / totalBoughtBtc : 0;

  const currentValue = currentValueUsd * rate;
  const pnl = pnlUsd * rate;
  const avgCost = avgCostUsd * rate;
  const netCost = netCostUsd * rate;
  const totalFees = totalFeesUsd * rate;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Portfolio
        </h3>

        {transactions.length > 0 ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">Holdings</p>
                <p className="text-lg font-bold text-gray-900">
                  {fmt(holdingsBtc, 6)} BTC
                </p>
                <p className="text-sm text-gray-500">
                  {symbol}
                  {fmt(currentValue)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">P&L</p>
                <p
                  className={`text-lg font-bold ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {pnl >= 0 ? "+" : ""}
                  {symbol}
                  {fmt(Math.abs(pnl))}
                </p>
                <p
                  className={`text-sm ${pnlPct >= 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {pnlPct >= 0 ? "+" : ""}
                  {pnlPct.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>
                Avg cost: {symbol}
                {fmt(avgCost)}/BTC
              </span>
              <span>
                Net invested: {symbol}
                {fmt(netCost)}
              </span>
              <span>
                Fees: {symbol}
                {fmt(totalFees)}
              </span>
              <span>
                {buys.length} buys, {sells.length} sells
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-400">
            No transactions yet. Record your first buy below.
          </p>
        )}
      </div>

      <AddTransactionForm
        currentPrice={currentPrice}
        currency={currency}
        exchangeRate={exchangeRate}
        overall={overall}
        signals={signals}
        onAdd={onTransactionsChange}
      />

      {transactions.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Transaction History
            </h4>
          </div>
          <div className="divide-y divide-gray-50">
            {[...transactions]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((t) => {
                const localAmount =
                  t.amountLocal *
                  (currency === t.currency
                    ? 1
                    : currency === "AUD"
                      ? rate
                      : 1 / rate);
                const displaySymbol = currency === "AUD" ? "A$" : "$";
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold ${t.type === "buy" ? "text-green-600" : "text-red-600"}`}
                        >
                          {t.type.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {fmt(t.amountBtc, 6)} BTC
                        </span>
                        <span className="text-xs text-gray-400">
                          @ {displaySymbol}
                          {fmt(t.priceUsd * rate)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400">
                        <span>{t.date}</span>
                        <span>
                          {displaySymbol}
                          {fmt(localAmount)}
                        </span>
                        {(t.feeUsd ?? 0) > 0 && (
                          <span>
                            (fee: {displaySymbol}
                            {fmt(
                              (t.feeLocal ?? t.feeUsd ?? 0) *
                                (currency === (t.currency ?? "USD")
                                  ? 1
                                  : currency === "AUD"
                                    ? rate
                                    : 1 / rate),
                            )}
                            )
                          </span>
                        )}
                        {t.notes && <span>· {t.notes}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => void deleteTransaction(t.id)}
                      className="shrink-0 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
