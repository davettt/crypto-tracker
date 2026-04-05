import { useState, useRef } from "react";

interface PreviewTx {
  type: string;
  asset: string;
  amount: number;
  amountCrypto: number;
  price: number;
  fee: number;
  currency: string;
  date: string;
  platform: string;
  isDuplicate: boolean;
}

interface PreviewResult {
  transactions: PreviewTx[];
  summary: { total: number; new: number; duplicates: number };
  errors: string[];
}

interface ConfirmResult {
  imported: number;
  skippedDuplicates: number;
  totalTransactions: number;
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function CsvImport({
  onImported,
  onClose,
}: {
  onImported: () => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [csvText, setCsvText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setCsvText(text);
    setError("");
    setPreview(null);
    setResult(null);

    setLoading(true);
    try {
      const res = await fetch("/api/import/coinspot/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to parse CSV");
        return;
      }
      setPreview(data);
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!csvText) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/import/coinspot/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed");
        return;
      }
      setResult(data);
      onImported();
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }

  const newTxs = preview?.transactions.filter((t) => !t.isDuplicate) ?? [];
  const dupeTxs = preview?.transactions.filter((t) => t.isDuplicate) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Import CoinSpot CSV
          </h3>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {/* Result message */}
          {result && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">
                Successfully imported {result.imported} transaction
                {result.imported !== 1 ? "s" : ""}
              </p>
              {result.skippedDuplicates > 0 && (
                <p className="mt-1 text-xs text-green-600">
                  Skipped {result.skippedDuplicates} duplicate
                  {result.skippedDuplicates !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}

          {/* File picker */}
          {!result && (
            <>
              <div>
                <p className="mb-2 text-sm text-gray-600">
                  Export your order history from CoinSpot and upload it here.
                  Only BTC/AUD, SOL/AUD, and RNDR/AUD rows will be imported.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => void handleFile(e)}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>

              {loading && (
                <p className="text-sm text-gray-400">Processing...</p>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Preview */}
              {preview && !loading && (
                <>
                  {/* Summary */}
                  <div className="flex gap-4 text-sm">
                    <span className="rounded bg-blue-50 px-3 py-1 text-blue-700">
                      {preview.summary.total} found
                    </span>
                    <span className="rounded bg-green-50 px-3 py-1 text-green-700">
                      {preview.summary.new} new
                    </span>
                    {preview.summary.duplicates > 0 && (
                      <span className="rounded bg-yellow-50 px-3 py-1 text-yellow-700">
                        {preview.summary.duplicates} duplicate
                        {preview.summary.duplicates !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {preview.errors.length > 0 && (
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                      <p className="text-xs font-medium text-yellow-800">
                        Parse warnings:
                      </p>
                      {preview.errors.map((e, i) => (
                        <p key={i} className="text-xs text-yellow-700">
                          {e}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* New transactions table */}
                  {newTxs.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Will Import ({newTxs.length})
                      </h4>
                      <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-gray-50">
                            <tr className="border-b border-gray-200">
                              <th className="px-3 py-2 text-gray-500">Date</th>
                              <th className="px-3 py-2 text-gray-500">Type</th>
                              <th className="px-3 py-2 text-gray-500">Asset</th>
                              <th className="px-3 py-2 text-right text-gray-500">
                                Crypto
                              </th>
                              <th className="px-3 py-2 text-right text-gray-500">
                                Price
                              </th>
                              <th className="px-3 py-2 text-right text-gray-500">
                                Total AUD
                              </th>
                              <th className="px-3 py-2 text-right text-gray-500">
                                Fee
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {newTxs.map((t, i) => (
                              <tr key={i}>
                                <td className="px-3 py-1.5 text-gray-700">
                                  {t.date}
                                </td>
                                <td className="px-3 py-1.5">
                                  <span
                                    className={`font-medium ${t.type === "buy" ? "text-green-600" : "text-red-600"}`}
                                  >
                                    {t.type.toUpperCase()}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 text-gray-700">
                                  {t.asset}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-700">
                                  {t.amountCrypto.toPrecision(6)}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-700">
                                  ${fmt(t.price)}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-700">
                                  ${fmt(t.amount)}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-700">
                                  ${fmt(t.fee)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Duplicate transactions */}
                  {dupeTxs.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-yellow-600">
                        Duplicates — will skip ({dupeTxs.length})
                      </h4>
                      <div className="max-h-32 overflow-y-auto rounded-lg border border-yellow-100 bg-yellow-50/50">
                        <table className="w-full text-left text-xs">
                          <tbody className="divide-y divide-yellow-100">
                            {dupeTxs.map((t, i) => (
                              <tr key={i} className="text-yellow-700">
                                <td className="px-3 py-1">{t.date}</td>
                                <td className="px-3 py-1">
                                  {t.type.toUpperCase()}
                                </td>
                                <td className="px-3 py-1">{t.asset}</td>
                                <td className="px-3 py-1 text-right">
                                  {t.amountCrypto.toPrecision(6)}
                                </td>
                                <td className="px-3 py-1 text-right">
                                  ${fmt(t.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Confirm button */}
                  {newTxs.length > 0 && (
                    <button
                      onClick={() => void handleConfirm()}
                      disabled={loading}
                      className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
                    >
                      Import {newTxs.length} Transaction
                      {newTxs.length !== 1 ? "s" : ""}
                    </button>
                  )}

                  {newTxs.length === 0 && preview.summary.total > 0 && (
                    <p className="text-center text-sm text-gray-500">
                      All transactions already exist — nothing to import.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
