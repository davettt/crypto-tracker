import { Router } from "express";
import {
  getPriceHistory,
  getCoinCurrent,
  getFearGreedIndex,
  getExchangeRates,
} from "../coingecko.js";
import {
  toWeekly,
  sma,
  rsi,
  mayerMultiple,
  generateSignals,
} from "../indicators.js";
import { loadPortfolio } from "./portfolio.js";
import { ASSETS, DEFAULT_ASSET, isValidAsset } from "../assets.js";

const router = Router();

// GET /api/market/overview — current price, signals, fear & greed
router.get("/overview", async (req, res) => {
  try {
    const assetId = req.query.asset ?? DEFAULT_ASSET;
    if (!isValidAsset(assetId)) {
      return res.status(400).json({ error: "Unknown asset" });
    }
    const asset = ASSETS[assetId];

    const portfolio = await loadPortfolio();
    const homeCurrency = portfolio.settings?.homeCurrency ?? "USD";

    const promises = [
      getPriceHistory(assetId),
      getCoinCurrent(assetId, homeCurrency),
      getExchangeRates(homeCurrency),
    ];
    // Fear & Greed is Bitcoin-specific
    if (asset.fearGreed) {
      promises.push(getFearGreedIndex());
    }

    const results = await Promise.all(promises);
    const [dailyPrices, current, exchangeRates] = results;
    const fearGreed = asset.fearGreed ? results[3] : null;

    const weeklyPrices = toWeekly(dailyPrices);
    const { signals, overall } = generateSignals(
      dailyPrices,
      weeklyPrices,
      current.priceUsd,
      current.ath,
    );

    res.json({
      current,
      fearGreed: fearGreed ? fearGreed[0] : null,
      fearGreedHistory: fearGreed ?? [],
      signals,
      overall,
      exchangeRates,
      homeCurrency,
      asset: assetId,
    });
  } catch (err) {
    console.error("Overview error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/market/chart — price history with indicators for charting
router.get("/chart", async (req, res) => {
  try {
    const assetId = req.query.asset ?? DEFAULT_ASSET;
    if (!isValidAsset(assetId)) {
      return res.status(400).json({ error: "Unknown asset" });
    }

    const dailyPrices = await getPriceHistory(assetId);
    const weeklyPrices = toWeekly(dailyPrices);

    const ma200d = sma(dailyPrices, 200);
    const weeklyRsi = rsi(weeklyPrices, 14);
    const mayer = mayerMultiple(dailyPrices);

    res.json({
      daily: dailyPrices.map((d, i) => ({
        date: d.date,
        price: d.price,
        ma200: ma200d[i]?.value ?? null,
        mayer: mayer[i]?.value ?? null,
      })),
      weekly: weeklyPrices.map((w, i) => ({
        date: w.date,
        price: w.price,
        rsi: weeklyRsi[i]?.value ?? null,
      })),
      asset: assetId,
    });
  } catch (err) {
    console.error("Chart error:", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
