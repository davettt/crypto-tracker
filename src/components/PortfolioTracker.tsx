import { useState } from "react";
import type { Transaction, Currency, Overall, Signal, AssetId } from "../types";
import { ASSETS } from "../types";
import CsvImport from "./CsvImport";

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Get the crypto amount from a transaction, handling legacy field names */
function getCryptoAmount(t: Transaction): number {
  return t.amountCrypto ?? t.amountBtc ?? 0;
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
  homeCurrency,
  symbol,
  assetSymbol,
  assetDecimals,
  activeAsset,
  overall,
  signals,
  onAdd,
}: {
  currentPrice: number;
  homeCurrency: Currency;
  symbol: string;
  assetSymbol: string;
  assetDecimals: number;
  activeAsset: AssetId;
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
  const [platform, setPlatform] = useState("");
  const [open, setOpen] = useState(false);

  const amountNum = parseFloat(amount) || 0;
  const feeNum = parseFloat(fee) || 0;
  const priceNum = parseFloat(price) || currentPrice;
  const effectiveAmount = type === "buy" ? amountNum - feeNum : amountNum;
  const cryptoAmount = priceNum > 0 ? effectiveAmount / priceNum : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountNum <= 0) return;

    await fetch("/api/portfolio/transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        asset: activeAsset,
        amount: amountNum,
        amountCrypto: cryptoAmount,
        price: priceNum,
        fee: feeNum,
        currency: homeCurrency,
        date,
        notes,
        platform,
      }),
    });

    setAmount("");
    setFee("");
    setPrice("");
    setNotes("");
    setPlatform("");
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
          Price per {assetSymbol} ({symbol}) — defaults to current
        </label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={fmt(currentPrice)}
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
                {fmt(amountNum, 2)} - {symbol}
                {fmt(feeNum, 2)} fee = {symbol}
                {fmt(effectiveAmount, 2)} invested
              </p>
              <p className="font-medium">
                = {fmt(cryptoAmount, assetDecimals)} {assetSymbol} at {symbol}
                {fmt(priceNum)}/{assetSymbol}
              </p>
            </>
          ) : (
            <>
              <p>
                {fmt(cryptoAmount, assetDecimals)} {assetSymbol} at {symbol}
                {fmt(priceNum)}/{assetSymbol}
              </p>
              <p className="font-medium">
                = {symbol}
                {fmt(amountNum, 2)} - {symbol}
                {fmt(feeNum, 2)} fee = {symbol}
                {fmt(amountNum - feeNum, 2)} received
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
        <label className="block text-xs text-gray-500">
          Platform (optional)
        </label>
        <input
          type="text"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          placeholder="e.g. Coinbase, Binance"
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

function TransactionRow({
  t,
  symbol,
  assetSymbol,
  assetDecimals,
  onDelete,
  onEdit,
}: {
  t: Transaction;
  symbol: string;
  assetSymbol: string;
  assetDecimals: number;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const txAmount = t.amount ?? t.amountLocal ?? 0;
  const txFee = t.fee ?? t.feeLocal ?? t.feeUsd ?? 0;
  const cryptoAmt = getCryptoAmount(t);
  const txPrice = t.price ?? (txAmount && cryptoAmt ? txAmount / cryptoAmt : 0);

  const [editType, setEditType] = useState(t.type);
  const [editAmount, setEditAmount] = useState(String(txAmount));
  const [editFee, setEditFee] = useState(String(txFee));
  const [editPrice, setEditPrice] = useState(String(txPrice));
  const [editDate, setEditDate] = useState(t.date);
  const [editPlatform, setEditPlatform] = useState(t.platform ?? "");
  const [editNotes, setEditNotes] = useState(t.notes);

  function handleSave() {
    const amount = parseFloat(editAmount) || 0;
    const fee = parseFloat(editFee) || 0;
    const price = parseFloat(editPrice) || 0;
    const effectiveAmount = editType === "buy" ? amount - fee : amount;
    const amountCrypto = price > 0 ? effectiveAmount / price : 0;
    if (amount <= 0 || amountCrypto <= 0) return;

    onEdit(t.id, {
      type: editType,
      amount,
      amountCrypto,
      price,
      fee,
      date: editDate,
      platform: editPlatform,
      notes: editNotes,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2 px-5 py-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditType("buy")}
            className={`flex-1 rounded py-1 text-xs font-medium ${editType === "buy" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-500"}`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setEditType("sell")}
            className={`flex-1 rounded py-1 text-xs font-medium ${editType === "sell" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-500"}`}
          >
            Sell
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-gray-400">
              Amount ({symbol})
            </label>
            <input
              type="number"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">
              Fee ({symbol})
            </label>
            <input
              type="number"
              value={editFee}
              onChange={(e) => setEditFee(e.target.value)}
              step="0.01"
              className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">
              Price/{assetSymbol} ({symbol})
            </label>
            <input
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              step="0.01"
              className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-gray-400">Date</label>
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">Platform</label>
            <input
              type="text"
              value={editPlatform}
              onChange={(e) => setEditPlatform(e.target.value)}
              className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">Notes</label>
            <input
              type="text"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="rounded bg-gray-900 px-3 py-1 text-xs text-white hover:bg-gray-700"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold ${t.type === "buy" ? "text-green-600" : "text-red-600"}`}
          >
            {t.type.toUpperCase()}
          </span>
          <span className="text-sm font-medium text-gray-900">
            {symbol}
            {fmt(txAmount, 2)}
          </span>
          <span className="text-xs text-gray-400">
            {fmt(cryptoAmt, assetDecimals)} {assetSymbol} @ {symbol}
            {fmt(txPrice)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400">
          <span>{t.date}</span>
          {t.platform && <span>· {t.platform}</span>}
          {txFee > 0 && (
            <span>
              fee: {symbol}
              {fmt(txFee, 2)}
            </span>
          )}
          {t.notes && <span>· {t.notes}</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={() => setEditing(true)}
          className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          Edit
        </button>
        <button
          onClick={() => void onDelete(t.id)}
          className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function TransactionModal({
  transactions,
  symbol,
  assetSymbol,
  assetDecimals,
  onDelete,
  onEdit,
  onClose,
}: {
  transactions: Transaction[];
  symbol: string;
  assetSymbol: string;
  assetDecimals: number;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            All Transactions ({transactions.length})
          </h3>
          <div className="flex items-center gap-3">
            <a
              href="/api/portfolio/export"
              download
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Export CSV
            </a>
            <button
              onClick={onClose}
              className="rounded px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              Close
            </button>
          </div>
        </div>
        <div className="divide-y divide-gray-50 overflow-y-auto">
          {sorted.map((t) => (
            <TransactionRow
              key={t.id}
              t={t}
              symbol={symbol}
              assetSymbol={assetSymbol}
              assetDecimals={assetDecimals}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PortfolioTracker({
  currentPrice,
  homeCurrency,
  symbol,
  overall,
  signals,
  transactions,
  activeAsset,
  onTransactionsChange,
}: {
  currentPrice: number;
  homeCurrency: Currency;
  symbol: string;
  overall: Overall;
  signals: Signal[];
  transactions: Transaction[];
  activeAsset: AssetId;
  onTransactionsChange: () => void;
}) {
  const [showAllTx, setShowAllTx] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const assetConfig = ASSETS[activeAsset];
  const assetSymbol = assetConfig.symbol;
  const assetDecimals = assetConfig.decimals;

  async function deleteTransaction(id: string) {
    await fetch(`/api/portfolio/transaction/${id}`, { method: "DELETE" });
    onTransactionsChange();
  }

  async function editTransaction(id: string, updates: Record<string, unknown>) {
    await fetch(`/api/portfolio/transaction/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    onTransactionsChange();
  }

  // Calculate portfolio stats
  const buys = transactions.filter((t) => t.type === "buy");
  const sells = transactions.filter((t) => t.type === "sell");
  const totalBoughtCrypto = buys.reduce((s, t) => s + getCryptoAmount(t), 0);
  const totalSoldCrypto = sells.reduce((s, t) => s + getCryptoAmount(t), 0);
  const holdingsCrypto = totalBoughtCrypto - totalSoldCrypto;
  const totalInvested = buys.reduce(
    (s, t) => s + (t.amount ?? t.amountLocal ?? 0),
    0,
  );
  const totalReceived = sells.reduce(
    (s, t) => s + (t.amount ?? t.amountLocal ?? 0),
    0,
  );
  const totalFees = transactions.reduce(
    (s, t) => s + (t.fee ?? t.feeLocal ?? t.feeUsd ?? 0),
    0,
  );

  const currentValue = holdingsCrypto * currentPrice;
  const netCost = totalInvested - totalReceived;
  const pnl = currentValue - netCost;
  const pnlPct = netCost > 0 ? (pnl / netCost) * 100 : 0;
  const avgCost = totalBoughtCrypto > 0 ? totalInvested / totalBoughtCrypto : 0;

  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  const recentTx = sorted.slice(0, 3);
  const hasMore = transactions.length > 3;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          {assetSymbol} Portfolio
        </h3>

        {transactions.length > 0 ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">Holdings</p>
                <p className="text-lg font-bold text-gray-900">
                  {fmt(holdingsCrypto, assetDecimals)} {assetSymbol}
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
                {fmt(avgCost)}/{assetSymbol}
              </span>
              <span>
                Net invested: {symbol}
                {fmt(netCost)}
              </span>
              <span>
                Fees: {symbol}
                {fmt(totalFees, 2)}
              </span>
              <span>
                {buys.length} buys, {sells.length} sells
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-gray-400">
              No {assetSymbol} transactions yet. Record your first buy below.
            </p>
            <button
              onClick={() => setShowImport(true)}
              className="mt-2 text-xs text-blue-500 hover:text-blue-700"
            >
              Import from CoinSpot CSV
            </button>
          </div>
        )}
      </div>

      <AddTransactionForm
        currentPrice={currentPrice}
        homeCurrency={homeCurrency}
        symbol={symbol}
        assetSymbol={assetSymbol}
        assetDecimals={assetDecimals}
        activeAsset={activeAsset}
        overall={overall}
        signals={signals}
        onAdd={onTransactionsChange}
      />

      {transactions.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Recent Transactions
              </h4>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowImport(true)}
                  className="text-xs text-blue-500 hover:text-blue-700"
                >
                  Import CSV
                </button>
                <a
                  href="/api/portfolio/export"
                  download
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Export CSV
                </a>
                {hasMore && (
                  <button
                    onClick={() => setShowAllTx(true)}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    View all ({transactions.length})
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {recentTx.map((t) => (
              <TransactionRow
                key={t.id}
                t={t}
                symbol={symbol}
                assetSymbol={assetSymbol}
                assetDecimals={assetDecimals}
                onDelete={deleteTransaction}
                onEdit={editTransaction}
              />
            ))}
          </div>
        </div>
      )}

      {showAllTx && (
        <TransactionModal
          transactions={transactions}
          symbol={symbol}
          assetSymbol={assetSymbol}
          assetDecimals={assetDecimals}
          onDelete={deleteTransaction}
          onEdit={editTransaction}
          onClose={() => setShowAllTx(false)}
        />
      )}

      {showImport && (
        <CsvImport
          onImported={onTransactionsChange}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
