import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "../../local_data/portfolio.json");

const router = Router();

async function loadPortfolio() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      settings: { initialCapitalUsd: 0, mode: "dca" },
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
    // Ensure settings exist for older data files
    if (!portfolio.settings) {
      portfolio.settings = { initialCapitalUsd: 0, mode: "dca" };
    }
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/portfolio/settings — update capital pool and mode
router.put("/settings", async (req, res) => {
  try {
    const { initialCapitalUsd, mode } = req.body;
    if (
      initialCapitalUsd != null &&
      (typeof initialCapitalUsd !== "number" ||
        !isFinite(initialCapitalUsd) ||
        initialCapitalUsd < 0)
    ) {
      return res
        .status(400)
        .json({ error: "initialCapitalUsd must be a non-negative number" });
    }
    if (mode != null && !["dca", "lump"].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "dca" or "lump"' });
    }
    const portfolio = await loadPortfolio();
    if (!portfolio.settings) {
      portfolio.settings = { initialCapitalUsd: 0, mode: "dca" };
    }
    if (initialCapitalUsd != null) {
      portfolio.settings.initialCapitalUsd = initialCapitalUsd;
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
      amountUsd,
      amountBtc,
      priceUsd,
      feeUsd,
      feeLocal,
      currency,
      amountLocal,
      date,
      notes,
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
    if (
      amountUsd != null &&
      (typeof amountUsd !== "number" || !isFinite(amountUsd) || amountUsd < 0)
    ) {
      return res
        .status(400)
        .json({ error: "amountUsd must be a non-negative number" });
    }
    if (
      priceUsd != null &&
      (typeof priceUsd !== "number" || !isFinite(priceUsd) || priceUsd < 0)
    ) {
      return res
        .status(400)
        .json({ error: "priceUsd must be a non-negative number" });
    }
    if (
      feeUsd != null &&
      (typeof feeUsd !== "number" || !isFinite(feeUsd) || feeUsd < 0)
    ) {
      return res
        .status(400)
        .json({ error: "feeUsd must be a non-negative number" });
    }
    if (currency != null && !["USD", "AUD"].includes(currency)) {
      return res.status(400).json({ error: 'currency must be "USD" or "AUD"' });
    }
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
      amountUsd: amountUsd ?? 0,
      amountBtc,
      priceUsd: priceUsd ?? 0,
      feeUsd: feeUsd ?? 0,
      feeLocal: feeLocal ?? 0,
      currency: currency ?? "USD",
      amountLocal: amountLocal ?? amountUsd ?? 0,
      date: date ?? new Date().toISOString().split("T")[0],
      notes: notes ?? "",
      createdAt: new Date().toISOString(),
    };

    const portfolio = await loadPortfolio();
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

export default router;
