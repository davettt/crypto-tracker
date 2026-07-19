import { Router } from "express";
import { loadPortfolio } from "./portfolio.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_ASSET } from "../assets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "../../local_data/portfolio.json");

const router = Router();

/** Map CoinSpot market pair to our asset ID */
const MARKET_TO_ASSET = {
  "BTC/AUD": "bitcoin",
  "ETH/AUD": "ethereum",
  "SOL/AUD": "solana",
  "RNDR/AUD": "render-token",
  "RENDER/AUD": "render-token",
  "TRX/AUD": "tron",
};

/**
 * Parse CoinSpot date "DD/MM/YYYY HH:MM AM/PM" → "YYYY-MM-DD"
 */
function parseCoinSpotDate(raw) {
  const match = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i,
  );
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse a number that may have a currency suffix like "0.99 AUD"
 */
function parseNum(val) {
  if (val == null || val === "") return 0;
  return parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 0;
}

/**
 * Parse CoinSpot CSV text into transaction objects.
 * Only processes rows matching requested markets (default: BTC/AUD only).
 */
function parseCoinSpotCsv(csvText, markets = null) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { transactions: [], errors: ["CSV is empty"] };

  // Parse header
  const header = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const col = (name) => header.indexOf(name);

  const iDate = col("Transaction Date");
  const iType = col("Type");
  const iMarket = col("Market");
  const iAmount = col("Amount");
  const iRateExFee = col("Rate ex. fee");
  const iFeeAud = col("Fee AUD (inc GST)");
  const iTotalAud = col("Total AUD");

  if (iDate === -1 || iType === -1 || iMarket === -1) {
    return {
      transactions: [],
      errors: ["Missing required columns: Transaction Date, Type, Market"],
    };
  }

  const allowedMarkets = markets
    ? new Set(markets)
    : new Set(Object.keys(MARKET_TO_ASSET));

  const transactions = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parse (handles quoted fields)
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    const market = fields[iMarket];
    if (!allowedMarkets.has(market)) continue;

    const assetId = MARKET_TO_ASSET[market];
    if (!assetId) continue;

    const type = fields[iType]?.toLowerCase();
    if (type !== "buy" && type !== "sell") {
      errors.push(`Row ${i + 1}: unknown type "${fields[iType]}"`);
      continue;
    }

    const date = parseCoinSpotDate(fields[iDate]);
    if (!date) {
      errors.push(`Row ${i + 1}: invalid date "${fields[iDate]}"`);
      continue;
    }

    const amountCrypto = parseFloat(fields[iAmount]) || 0;
    const rateExFee = parseNum(fields[iRateExFee]);
    const feeAud = parseNum(fields[iFeeAud]);
    const totalAud = parseNum(fields[iTotalAud]);

    if (amountCrypto <= 0) {
      errors.push(`Row ${i + 1}: invalid crypto amount`);
      continue;
    }

    // totalAud is the total fiat spent (for buys) or received (for sells)
    // rateExFee is the per-unit price excluding fees
    const price = rateExFee > 0 ? rateExFee : totalAud / amountCrypto;

    transactions.push({
      type,
      asset: assetId,
      amount: totalAud,
      amountCrypto,
      price,
      fee: feeAud,
      currency: "AUD",
      date,
      notes: "",
      platform: "CoinSpot",
    });
  }

  return { transactions, errors };
}

/**
 * Check for duplicate transactions (same date + asset + amount + type)
 */
function findDuplicates(newTxs, existingTxs) {
  const existingSet = new Set(
    existingTxs.map(
      (t) =>
        `${t.date}|${t.asset ?? DEFAULT_ASSET}|${(t.amountCrypto ?? t.amountBtc ?? 0).toFixed(8)}|${t.type}`,
    ),
  );

  return newTxs.map((t) => {
    const key = `${t.date}|${t.asset}|${t.amountCrypto.toFixed(8)}|${t.type}`;
    return { ...t, isDuplicate: existingSet.has(key) };
  });
}

// POST /api/import/coinspot/preview — parse CSV and return preview
router.post("/coinspot/preview", async (req, res) => {
  try {
    const { csv, markets } = req.body;
    if (!csv || typeof csv !== "string") {
      return res.status(400).json({ error: "csv field is required" });
    }

    const { transactions, errors } = parseCoinSpotCsv(csv, markets);
    const portfolio = await loadPortfolio();
    const withDupes = findDuplicates(transactions, portfolio.transactions);

    const dupeCount = withDupes.filter((t) => t.isDuplicate).length;
    const newCount = withDupes.filter((t) => !t.isDuplicate).length;

    res.json({
      transactions: withDupes,
      summary: {
        total: withDupes.length,
        new: newCount,
        duplicates: dupeCount,
      },
      errors,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/import/coinspot/confirm — commit previewed transactions (skip duplicates)
router.post("/coinspot/confirm", async (req, res) => {
  try {
    const { csv, markets } = req.body;
    if (!csv || typeof csv !== "string") {
      return res.status(400).json({ error: "csv field is required" });
    }

    const { transactions } = parseCoinSpotCsv(csv, markets);
    const portfolio = await loadPortfolio();
    const withDupes = findDuplicates(transactions, portfolio.transactions);
    const newTxs = withDupes.filter((t) => !t.isDuplicate);

    let imported = 0;
    for (const t of newTxs) {
      const tx = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: t.type,
        asset: t.asset,
        amount: t.amount,
        amountCrypto: t.amountCrypto,
        price: t.price,
        fee: t.fee,
        currency: t.currency,
        date: t.date,
        notes: t.notes,
        platform: t.platform,
        createdAt: new Date().toISOString(),
      };
      portfolio.transactions.push(tx);
      imported++;
    }

    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(portfolio, null, 2));

    res.json({
      imported,
      skippedDuplicates: withDupes.length - imported,
      totalTransactions: portfolio.transactions.length,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
