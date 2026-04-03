import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "../../local_data/portfolio.json");

const SUPPORTED_CURRENCIES = [
  "USD",
  "AUD",
  "GBP",
  "EUR",
  "JPY",
  "NZD",
  "SGD",
  "CAD",
];

const router = Router();

function migratePortfolio(portfolio) {
  if (portfolio.settings?.homeCurrency) return portfolio;

  // Infer home currency from existing transactions
  const txCurrencies = (portfolio.transactions ?? [])
    .map((t) => t.currency)
    .filter(Boolean);
  const homeCurrency = txCurrencies.length > 0 ? txCurrencies[0] : "USD";

  portfolio.settings = {
    ...portfolio.settings,
    homeCurrency,
    initialCapital: portfolio.settings?.initialCapitalUsd ?? 0,
    needsCapitalConfirmation: (portfolio.settings?.initialCapitalUsd ?? 0) > 0,
    mode: portfolio.settings?.mode ?? "dca",
  };

  // Migrate transactions: promote amountLocal to canonical
  if (portfolio.transactions) {
    portfolio.transactions = portfolio.transactions.map((t) => ({
      ...t,
      amount: t.amountLocal ?? t.amountUsd ?? 0,
      price:
        t.amountLocal && t.amountBtc
          ? t.amountLocal / t.amountBtc
          : (t.priceUsd ?? 0),
      fee: t.feeLocal ?? t.feeUsd ?? 0,
    }));
  }

  return portfolio;
}

export async function loadPortfolio() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const portfolio = JSON.parse(raw);
    return migratePortfolio(portfolio);
  } catch {
    return {
      settings: {
        homeCurrency: "USD",
        initialCapital: 0,
        mode: "dca",
      },
      transactions: [],
    };
  }
}

async function savePortfolio(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET /api/portfolio — return settings + transactions
router.get("/", async (_req, res) => {
  try {
    const portfolio = await loadPortfolio();
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/portfolio/settings — update capital pool, mode, and home currency
router.put("/settings", async (req, res) => {
  try {
    const { initialCapital, homeCurrency, mode } = req.body;
    if (
      initialCapital != null &&
      (typeof initialCapital !== "number" ||
        !isFinite(initialCapital) ||
        initialCapital < 0)
    ) {
      return res
        .status(400)
        .json({ error: "initialCapital must be a non-negative number" });
    }
    if (homeCurrency != null && !SUPPORTED_CURRENCIES.includes(homeCurrency)) {
      return res.status(400).json({ error: "Unsupported currency" });
    }
    if (mode != null && !["dca", "lump"].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "dca" or "lump"' });
    }
    const portfolio = await loadPortfolio();
    if (homeCurrency != null) {
      portfolio.settings.homeCurrency = homeCurrency;
    }
    if (initialCapital != null) {
      portfolio.settings.initialCapital = initialCapital;
      portfolio.settings.needsCapitalConfirmation = false;
    }
    if (mode != null) {
      portfolio.settings.mode = mode;
    }
    await savePortfolio(portfolio);
    res.json(portfolio.settings);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/portfolio/transaction — add a buy or sell
router.post("/transaction", async (req, res) => {
  try {
    const {
      type,
      amount,
      amountBtc,
      price,
      fee,
      currency,
      date,
      notes,
      // Legacy fields accepted for backward compat
      amountUsd,
      priceUsd,
      feeUsd,
      feeLocal,
      amountLocal,
    } = req.body;

    if (!type || !["buy", "sell"].includes(type)) {
      return res.status(400).json({ error: 'type must be "buy" or "sell"' });
    }
    if (
      typeof amountBtc !== "number" ||
      !isFinite(amountBtc) ||
      amountBtc <= 0
    ) {
      return res
        .status(400)
        .json({ error: "amountBtc must be a positive number" });
    }

    const portfolio = await loadPortfolio();
    const txCurrency = currency ?? portfolio.settings.homeCurrency ?? "USD";

    if (!SUPPORTED_CURRENCIES.includes(txCurrency)) {
      return res.status(400).json({ error: "Unsupported currency" });
    }

    const txAmount = amount ?? amountLocal ?? amountUsd ?? 0;
    const txPrice = price ?? priceUsd ?? 0;
    const txFee = fee ?? feeLocal ?? feeUsd ?? 0;

    if (date != null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD format" });
    }
    if (notes != null && (typeof notes !== "string" || notes.length > 500)) {
      return res
        .status(400)
        .json({ error: "notes must be a string under 500 characters" });
    }

    const transaction = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type,
      amount: txAmount,
      amountBtc,
      price: txPrice,
      fee: txFee,
      currency: txCurrency,
      date: date ?? new Date().toISOString().split("T")[0],
      notes: notes ?? "",
      createdAt: new Date().toISOString(),
    };

    portfolio.transactions.push(transaction);
    await savePortfolio(portfolio);

    res.json(transaction);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/portfolio/transaction/:id
router.delete("/transaction/:id", async (req, res) => {
  try {
    const portfolio = await loadPortfolio();
    portfolio.transactions = portfolio.transactions.filter(
      (t) => t.id !== req.params.id,
    );
    await savePortfolio(portfolio);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/portfolio/export — CSV export of all transactions
router.get("/export", async (_req, res) => {
  try {
    const portfolio = await loadPortfolio();
    const txs = portfolio.transactions ?? [];
    const currency = portfolio.settings?.homeCurrency ?? "USD";

    const header =
      "Date,Type,Amount (" +
      currency +
      "),BTC Amount,Price per BTC (" +
      currency +
      "),Fee (" +
      currency +
      "),Currency,Notes";

    const rows = [...txs]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => {
        const amt = t.amount ?? t.amountLocal ?? t.amountUsd ?? 0;
        const price =
          t.price ??
          (t.amountLocal && t.amountBtc ? t.amountLocal / t.amountBtc : 0);
        const fee = t.fee ?? t.feeLocal ?? t.feeUsd ?? 0;
        const notes = (t.notes ?? "").replace(/"/g, '""');
        return [
          t.date,
          t.type,
          amt.toFixed(2),
          t.amountBtc.toFixed(8),
          price.toFixed(2),
          fee.toFixed(2),
          t.currency ?? currency,
          `"${notes}"`,
        ].join(",");
      });

    const csv = [header, ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="btc-transactions-${new Date().toISOString().split("T")[0]}.csv"`,
    );
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/portfolio/reset — delete all transactions and reset investment pool
router.post("/reset", async (req, res) => {
  try {
    const { homeCurrency } = req.body;
    if (homeCurrency != null && !SUPPORTED_CURRENCIES.includes(homeCurrency)) {
      return res.status(400).json({ error: "Unsupported currency" });
    }
    const portfolio = await loadPortfolio();
    const newCurrency =
      homeCurrency ?? portfolio.settings?.homeCurrency ?? "USD";
    portfolio.settings = {
      homeCurrency: newCurrency,
      initialCapital: 0,
      mode: portfolio.settings?.mode ?? "dca",
    };
    portfolio.transactions = [];
    await savePortfolio(portfolio);
    res.json({ ok: true, settings: portfolio.settings });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
