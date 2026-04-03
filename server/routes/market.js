import { Router } from "express";
import {
  getBtcPriceHistory,
  getBtcCurrent,
  getFearGreedIndex,
  getExchangeRate,
} from "../coingecko.js";
import {
  toWeekly,
  sma,
  rsi,
  mayerMultiple,
  generateSignals,
} from "../indicators.js";

const router = Router();

// GET /api/market/overview — current price, signals, fear & greed
router.get("/overview", async (_req, res) => {
  try {
    const [dailyPrices, current, fearGreed, exchangeRate] = await Promise.all([
      getBtcPriceHistory(),
      getBtcCurrent(),
      getFearGreedIndex(),
      getExchangeRate(),
    ]);

    const weeklyPrices = toWeekly(dailyPrices);
    const { signals, overall } = generateSignals(
      dailyPrices,
      weeklyPrices,
      current.price,
      current.ath,
    );

    res.json({
      current,
      fearGreed: fearGreed[0],
      fearGreedHistory: fearGreed,
      signals,
      overall,
      exchangeRate,
    });
  } catch (err) {
    console.error("Overview error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/market/chart — price history with indicators for charting
router.get("/chart", async (_req, res) => {
  try {
    const dailyPrices = await getBtcPriceHistory();
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
    });
  } catch (err) {
    console.error("Chart error:", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
