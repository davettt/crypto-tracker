import { Router } from "express";
import {
  getPriceHistory,
  getCoinCurrent,
  getFearGreedIndex,
  getExchangeRates,
  invalidateCache,
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

    if (req.query.force === "true") {
      await invalidateCache(assetId);
    }

    const portfolio = await loadPortfolio();
    const homeCurrency = portfolio.settings?.homeCurrency ?? "USD";

    const promises = [
      getPriceHistory(assetId, homeCurrency),
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

    // Historical prices and current price are both in homeCurrency, so signals
    // (and their MA values) are computed natively in homeCurrency — no FX
    // conversion step that would distort historical values.
    const weeklyPrices = toWeekly(dailyPrices);
    const { signals, overall } = generateSignals(
      dailyPrices,
      weeklyPrices,
      current.price,
      current.ath,
      assetId,
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

    if (req.query.force === "true") {
      await invalidateCache(assetId);
    }

    const portfolio = await loadPortfolio();
    const homeCurrency = portfolio.settings?.homeCurrency ?? "USD";

    const [dailyPrices, current] = await Promise.all([
      getPriceHistory(assetId, homeCurrency),
      getCoinCurrent(assetId, homeCurrency),
    ]);

    // Historical and current price are both in homeCurrency. Append the live
    // price as today's data point so the chart matches the header exactly.
    const today = new Date().toISOString().split("T")[0];
    const lastDay = dailyPrices[dailyPrices.length - 1];
    const withLive =
      lastDay && lastDay.date === today
        ? dailyPrices.map((d) =>
            d === lastDay ? { ...d, price: current.price } : d,
          )
        : [
            ...dailyPrices,
            {
              date: today,
              price: current.price,
              timestamp: Date.now(),
            },
          ];

    const weeklyPrices = toWeekly(withLive);

    const ma200d = sma(withLive, 200);
    const weeklyRsi = rsi(weeklyPrices, 14);
    const mayer = mayerMultiple(withLive);

    res.json({
      daily: withLive.map((d, i) => ({
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
      // Source currency for all daily/weekly prices in this response. Client
      // uses this to convert to displayCurrency when it differs from home.
      currency: homeCurrency,
      asset: assetId,
    });
  } catch (err) {
    console.error("Chart error:", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
