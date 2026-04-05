import { Router } from "express";
import { loadPortfolio } from "./portfolio.js";
import { computeFIFO, computeFYSummary, detectFYs } from "../fifo.js";
import { ASSETS, isValidAsset, DEFAULT_ASSET } from "../assets.js";

const router = Router();

// GET /api/tax/costbasis?asset=bitcoin — FIFO lots + disposals for an asset
router.get("/costbasis", async (req, res) => {
  try {
    const asset = req.query.asset ?? DEFAULT_ASSET;
    if (!isValidAsset(asset)) {
      return res.status(400).json({ error: "Unknown asset" });
    }

    const portfolio = await loadPortfolio();
    const txs = portfolio.transactions.filter(
      (t) => (t.asset ?? DEFAULT_ASSET) === asset,
    );

    const result = computeFIFO(txs);
    res.json({ asset, ...result });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/tax/summary?fy=2025-2026&asset=bitcoin — FY summary for one asset
// GET /api/tax/summary?fy=2025-2026 — FY summary across all assets
router.get("/summary", async (req, res) => {
  try {
    const fy = req.query.fy;
    if (!fy || !/^\d{4}-\d{4}$/.test(fy)) {
      return res
        .status(400)
        .json({ error: "fy parameter required (e.g. 2025-2026)" });
    }

    const portfolio = await loadPortfolio();
    const marginalTaxRate =
      portfolio.settings?.taxSettings?.marginalTaxRate ?? 0.325;

    const assetFilter = req.query.asset;

    // Collect disposals across assets
    let allDisposals = [];
    const assetIds = assetFilter ? [assetFilter] : Object.keys(ASSETS);

    for (const assetId of assetIds) {
      const txs = portfolio.transactions.filter(
        (t) => (t.asset ?? DEFAULT_ASSET) === assetId,
      );
      if (txs.length === 0) continue;
      const { disposals } = computeFIFO(txs);
      allDisposals.push(...disposals.map((d) => ({ ...d, asset: assetId })));
    }

    const summary = computeFYSummary(allDisposals, fy, marginalTaxRate);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/tax/fys — detect available financial years from transactions
router.get("/fys", async (_req, res) => {
  try {
    const portfolio = await loadPortfolio();
    const fys = detectFYs(portfolio.transactions);
    res.json({ fys });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/tax/export?fy=2025-2026 — CSV export of disposals
router.get("/export", async (req, res) => {
  try {
    const fy = req.query.fy;
    if (!fy || !/^\d{4}-\d{4}$/.test(fy)) {
      return res
        .status(400)
        .json({ error: "fy parameter required (e.g. 2025-2026)" });
    }

    const portfolio = await loadPortfolio();
    const marginalTaxRate =
      portfolio.settings?.taxSettings?.marginalTaxRate ?? 0.325;

    let allDisposals = [];
    for (const assetId of Object.keys(ASSETS)) {
      const txs = portfolio.transactions.filter(
        (t) => (t.asset ?? DEFAULT_ASSET) === assetId,
      );
      if (txs.length === 0) continue;
      const { disposals } = computeFIFO(txs);
      allDisposals.push(...disposals.map((d) => ({ ...d, asset: assetId })));
    }

    const summary = computeFYSummary(allDisposals, fy, marginalTaxRate);

    const header =
      "Date Acquired,Date Sold,Asset,Amount,Cost Basis,Proceeds,Sell Fee,Gain/Loss,Holding Days,CGT Discount,Taxable Gain";
    const rows = summary.disposals.map((d) => {
      const taxableGain = d.discountEligible
        ? Math.max(0, d.gain) * 0.5 + Math.min(0, d.gain)
        : d.gain;
      return [
        d.buyDate,
        d.sellDate,
        d.asset,
        d.amountCrypto.toPrecision(8),
        d.costBasis.toFixed(2),
        d.proceeds.toFixed(2),
        d.sellFee.toFixed(2),
        d.gain.toFixed(2),
        d.holdingDays,
        d.discountEligible ? "Yes" : "No",
        taxableGain.toFixed(2),
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tax-report-${fy}.csv"`,
    );
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
