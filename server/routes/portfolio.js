import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ASSET_IDS, isValidAsset, DEFAULT_ASSET } from "../assets.js";

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
  // Settings migration
  if (!portfolio.settings?.homeCurrency) {
    const txCurrencies = (portfolio.transactions ?? [])
      .map((t) => t.currency)
      .filter(Boolean);
    const homeCurrency = txCurrencies.length > 0 ? txCurrencies[0] : "USD";
    portfolio.settings = {
      ...portfolio.settings,
      homeCurrency,
      initialCapital: portfolio.settings?.initialCapitalUsd ?? 0,
      needsCapitalConfirmation:
        (portfolio.settings?.initialCapitalUsd ?? 0) > 0,
      mode: portfolio.settings?.mode ?? "dca",
    };
  }

  // Add default taxSettings if missing
  if (!portfolio.settings.taxSettings) {
    portfolio.settings.taxSettings = {
      marginalTaxRate: 0.325,
      exchangeFeeRate: 0.006,
    };
  }

  // Transaction migration
  if (portfolio.transactions) {
    let changed = false;
    portfolio.transactions = portfolio.transactions.map((t) => {
      const updates = {};

      // Legacy amount fields
      if (t.amount == null && (t.amountLocal != null || t.amountUsd != null)) {
        updates.amount = t.amountLocal ?? t.amountUsd ?? 0;
      }
      if (t.price == null && t.priceUsd != null) {
        updates.price =
          t.amountLocal && t.amountBtc
            ? t.amountLocal / t.amountBtc
            : (t.priceUsd ?? 0);
      }
      if (t.fee == null && (t.feeLocal != null || t.feeUsd != null)) {
        updates.fee = t.feeLocal ?? t.feeUsd ?? 0;
      }

      // Multi-asset migration: add asset field, rename amountBtc → amountCrypto
      if (!t.asset) {
        updates.asset = DEFAULT_ASSET;
        changed = true;
      }
      if (t.amountCrypto == null && t.amountBtc != null) {
        updates.amountCrypto = t.amountBtc;
        changed = true;
      }

      if (Object.keys(updates).length === 0) return t;
      return { ...t, ...updates };
    });
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
        taxSettings: { marginalTaxRate: 0.325, exchangeFeeRate: 0.006 },
      },
      transactions: [],
    };
  }
}

async function savePortfolio(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET /api/portfolio — return settings + transactions (optionally filtered by asset)
router.get("/", async (req, res) => {
  try {
    const portfolio = await loadPortfolio();
    const assetFilter = req.query.asset;
    if (assetFilter) {
      portfolio.transactions = portfolio.transactions.filter(
        (t) => (t.asset ?? DEFAULT_ASSET) === assetFilter,
      );
    }
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/portfolio/settings — update capital pool, mode, home currency, tax settings
router.put("/settings", async (req, res) => {
  try {
    const { initialCapital, homeCurrency, mode, taxSettings } = req.body;
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
    if (taxSettings != null) {
      portfolio.settings.taxSettings = {
        ...portfolio.settings.taxSettings,
        ...taxSettings,
      };
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
      asset,
      amount,
      amountCrypto,
      amountBtc, // legacy compat
      price,
      fee,
      currency,
      date,
      notes,
      platform,
    } = req.body;

    if (!type || !["buy", "sell"].includes(type)) {
      return res.status(400).json({ error: 'type must be "buy" or "sell"' });
    }

    const txAsset = asset ?? DEFAULT_ASSET;
    if (!isValidAsset(txAsset)) {
      return res.status(400).json({ error: "Unknown asset" });
    }

    const txAmountCrypto = amountCrypto ?? amountBtc;
    if (
      typeof txAmountCrypto !== "number" ||
      !isFinite(txAmountCrypto) ||
      txAmountCrypto <= 0
    ) {
      return res
        .status(400)
        .json({ error: "amountCrypto must be a positive number" });
    }

    const portfolio = await loadPortfolio();
    const txCurrency = currency ?? portfolio.settings.homeCurrency ?? "USD";

    if (!SUPPORTED_CURRENCIES.includes(txCurrency)) {
      return res.status(400).json({ error: "Unsupported currency" });
    }

    const txAmount = amount ?? 0;
    const txPrice = price ?? 0;
    const txFee = fee ?? 0;

    if (date != null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD format" });
    }
    if (notes != null && (typeof notes !== "string" || notes.length > 500)) {
      return res
        .status(400)
        .json({ error: "notes must be a string under 500 characters" });
    }
    if (
      platform != null &&
      (typeof platform !== "string" || platform.length > 100)
    ) {
      return res
        .status(400)
        .json({ error: "platform must be a string under 100 characters" });
    }

    const transaction = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type,
      asset: txAsset,
      amount: txAmount,
      amountCrypto: txAmountCrypto,
      price: txPrice,
      fee: txFee,
      currency: txCurrency,
      date: date ?? new Date().toISOString().split("T")[0],
      notes: notes ?? "",
      platform: platform ?? "",
      createdAt: new Date().toISOString(),
    };

    portfolio.transactions.push(transaction);
    await savePortfolio(portfolio);

    res.json(transaction);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/portfolio/transaction/:id — edit an existing transaction
router.put("/transaction/:id", async (req, res) => {
  try {
    const portfolio = await loadPortfolio();
    const idx = portfolio.transactions.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const {
      type,
      amount,
      amountCrypto,
      amountBtc,
      price,
      fee,
      date,
      notes,
      platform,
    } = req.body;

    if (type != null && !["buy", "sell"].includes(type)) {
      return res.status(400).json({ error: 'type must be "buy" or "sell"' });
    }
    const newAmountCrypto = amountCrypto ?? amountBtc;
    if (
      newAmountCrypto != null &&
      (typeof newAmountCrypto !== "number" ||
        !isFinite(newAmountCrypto) ||
        newAmountCrypto <= 0)
    ) {
      return res
        .status(400)
        .json({ error: "amountCrypto must be a positive number" });
    }
    if (date != null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD format" });
    }
    if (notes != null && (typeof notes !== "string" || notes.length > 500)) {
      return res
        .status(400)
        .json({ error: "notes must be a string under 500 characters" });
    }
    if (
      platform != null &&
      (typeof platform !== "string" || platform.length > 100)
    ) {
      return res
        .status(400)
        .json({ error: "platform must be a string under 100 characters" });
    }

    const tx = portfolio.transactions[idx];
    if (type != null) tx.type = type;
    if (amount != null) tx.amount = amount;
    if (newAmountCrypto != null) tx.amountCrypto = newAmountCrypto;
    if (price != null) tx.price = price;
    if (fee != null) tx.fee = fee;
    if (date != null) tx.date = date;
    if (notes != null) tx.notes = notes;
    if (platform != null) tx.platform = platform;

    await savePortfolio(portfolio);
    res.json(tx);
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

// GET /api/portfolio/export — CSV export of transactions
router.get("/export", async (req, res) => {
  try {
    const portfolio = await loadPortfolio();
    let txs = portfolio.transactions ?? [];
    const currency = portfolio.settings?.homeCurrency ?? "USD";

    const assetFilter = req.query.asset;
    if (assetFilter) {
      txs = txs.filter((t) => (t.asset ?? DEFAULT_ASSET) === assetFilter);
    }

    const header =
      "Date,Asset,Type,Amount (" +
      currency +
      "),Crypto Amount,Price per Unit (" +
      currency +
      "),Fee (" +
      currency +
      "),Currency,Platform,Notes";

    const rows = [...txs]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => {
        const amt = t.amount ?? t.amountLocal ?? t.amountUsd ?? 0;
        const cryptoAmt = t.amountCrypto ?? t.amountBtc ?? 0;
        const price =
          t.price ??
          (t.amountLocal && cryptoAmt ? t.amountLocal / cryptoAmt : 0);
        const fee = t.fee ?? t.feeLocal ?? t.feeUsd ?? 0;
        const notes = (t.notes ?? "").replace(/"/g, '""');
        const platform = (t.platform ?? "").replace(/"/g, '""');
        const asset = t.asset ?? DEFAULT_ASSET;
        return [
          t.date,
          asset,
          t.type,
          amt.toFixed(2),
          cryptoAmt.toPrecision(8),
          price.toFixed(2),
          fee.toFixed(2),
          t.currency ?? currency,
          `"${platform}"`,
          `"${notes}"`,
        ].join(",");
      });

    const csv = [header, ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="crypto-transactions-${new Date().toISOString().split("T")[0]}.csv"`,
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
      taxSettings: portfolio.settings?.taxSettings ?? {
        marginalTaxRate: 0.325,
        exchangeFeeRate: 0.006,
      },
    };
    portfolio.transactions = [];
    await savePortfolio(portfolio);
    res.json({ ok: true, settings: portfolio.settings });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
