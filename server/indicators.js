/**
 * Technical indicators for long-term BTC strategy.
 * Focused on weekly timeframes to filter noise.
 */

/**
 * Convert daily prices to weekly (Sunday close).
 * Each entry uses the last price of that ISO week.
 */
export function toWeekly(dailyPrices) {
  const weeks = new Map();
  for (const d of dailyPrices) {
    const dt = new Date(d.date);
    // ISO week: get the Thursday of the week, then derive week number
    const year = dt.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const dayOfYear = Math.ceil((dt - oneJan) / 86400000) + 1;
    const weekNum = Math.ceil(dayOfYear / 7);
    const key = `${year}-W${String(weekNum).padStart(2, "0")}`;
    weeks.set(key, d); // last entry for each week wins
  }
  return Array.from(weeks.values());
}

/**
 * Simple Moving Average over `period` data points.
 */
export function sma(prices, period) {
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push({ date: prices[i].date, value: null });
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += prices[j].price;
    }
    result.push({ date: prices[i].date, value: sum / period });
  }
  return result;
}

/**
 * Exponential Moving Average.
 */
export function ema(prices, period) {
  const k = 2 / (period + 1);
  const result = [];
  let prev = null;

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push({ date: prices[i].date, value: null });
      continue;
    }
    if (prev === null) {
      // Seed with SMA
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += prices[j].price;
      }
      prev = sum / period;
    } else {
      prev = prices[i].price * k + prev * (1 - k);
    }
    result.push({ date: prices[i].date, value: prev });
  }
  return result;
}

/**
 * RSI (Relative Strength Index) over `period` data points.
 * < 30 = oversold (buy signal for long-term)
 * > 70 = overbought (consider taking profits)
 */
export function rsi(prices, period = 14) {
  const result = [];
  const gains = [];
  const losses = [];

  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      result.push({ date: prices[i].date, value: null });
      continue;
    }

    const change = prices[i].price - prices[i - 1].price;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);

    if (i < period) {
      result.push({ date: prices[i].date, value: null });
      continue;
    }

    let avgGain, avgLoss;
    if (i === period) {
      avgGain = gains.reduce((s, g) => s + g, 0) / period;
      avgLoss = losses.reduce((s, l) => s + l, 0) / period;
    } else {
      const prevResult = result[i - 1];
      const prevRsi = prevResult.value;
      if (prevRsi === null) {
        result.push({ date: prices[i].date, value: null });
        continue;
      }
      // Recover previous avgGain/avgLoss from stored RSI
      // RSI = 100 - 100/(1+RS), RS = avgGain/avgLoss
      // Instead, just use smoothed calculation
      const prevAvgGain =
        i === period
          ? gains.reduce((s, g) => s + g, 0) / period
          : result[i - 1]._avgGain;
      const prevAvgLoss =
        i === period
          ? losses.reduce((s, l) => s + l, 0) / period
          : result[i - 1]._avgLoss;
      avgGain = (prevAvgGain * (period - 1) + gains[gains.length - 1]) / period;
      avgLoss =
        (prevAvgLoss * (period - 1) + losses[losses.length - 1]) / period;
    }

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsiVal = 100 - 100 / (1 + rs);
    result.push({
      date: prices[i].date,
      value: Math.round(rsiVal * 100) / 100,
      _avgGain: avgGain,
      _avgLoss: avgLoss,
    });
  }

  // Strip internal fields
  return result.map(({ date, value }) => ({ date, value }));
}

/**
 * MAYER MULTIPLE = price / 200-day MA.
 * < 0.8 historically = strong buy zone
 * > 2.4 historically = overheated
 */
export function mayerMultiple(dailyPrices) {
  const ma200 = sma(dailyPrices, 200);
  return dailyPrices.map((d, i) => ({
    date: d.date,
    value: ma200[i].value
      ? Math.round((d.price / ma200[i].value) * 1000) / 1000
      : null,
  }));
}

/**
 * MA Convergence — detects when the 200-day MA is declining toward a
 * stabilised price, signalling a potential bottom.
 *
 * Returns null if not enough data, or an object with:
 *   - gapNow: current gap between price and MA (%)
 *   - gapPrev: gap 30 days ago (%)
 *   - priceRange: price volatility over last 30 days (%)
 *   - maSlope: MA change over 30 days (%)
 *   - converging: boolean — true if conditions met
 */
export function maConvergence(dailyPrices, ma200) {
  const validMa = ma200.filter((m) => m.value !== null);
  if (validMa.length < 30 || dailyPrices.length < 30) return null;

  const last30 = dailyPrices.slice(-30);
  const last30Ma = validMa.slice(-30);
  if (last30Ma.length < 30) return null;

  const prices = last30.map((d) => d.price);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
  const priceRange = ((high - low) / avg) * 100;

  const maNow = last30Ma[last30Ma.length - 1].value;
  const ma30Ago = last30Ma[0].value;
  const maSlope = ((maNow - ma30Ago) / ma30Ago) * 100;

  const currentPrice = prices[prices.length - 1];
  const gapNow = ((currentPrice - maNow) / maNow) * 100;
  const price30Ago = last30[0].price;
  const gapPrev = ((price30Ago - ma30Ago) / ma30Ago) * 100;

  const maAbovePrice = maNow > currentPrice;
  const maDeclining = maSlope < -1;
  const gapNarrowing = Math.abs(gapNow) < Math.abs(gapPrev);
  const priceStable = priceRange < 25;
  const gapCloseEnough = Math.abs(gapNow) <= 30;

  return {
    gapNow: Math.round(gapNow * 10) / 10,
    gapPrev: Math.round(gapPrev * 10) / 10,
    priceRange: Math.round(priceRange * 10) / 10,
    maSlope: Math.round(maSlope * 10) / 10,
    converging:
      maAbovePrice &&
      maDeclining &&
      gapNarrowing &&
      priceStable &&
      gapCloseEnough,
  };
}

/**
 * Generate buy/sell signals based on multiple indicators.
 */
export function generateSignals(
  dailyPrices,
  weeklyPrices,
  currentPrice,
  ath,
  _assetId = null,
) {
  const weeklyRsi = rsi(weeklyPrices, 14);
  const ma200 = sma(dailyPrices, 200);
  const ma200w = sma(weeklyPrices, 200);
  const mayer = mayerMultiple(dailyPrices);

  const latestWeeklyRsi = weeklyRsi.filter((r) => r.value !== null).at(-1);
  const latestMa200 = ma200.filter((r) => r.value !== null).at(-1);
  const latestMa200w = ma200w.filter((r) => r.value !== null).at(-1);
  const latestMayer = mayer.filter((r) => r.value !== null).at(-1);
  const athDrawdown = ((currentPrice - ath) / ath) * 100;

  const signals = [];

  // Weekly RSI signals
  if (latestWeeklyRsi?.value != null) {
    if (latestWeeklyRsi.value < 30) {
      signals.push({
        type: "buy",
        strength: "strong",
        indicator: "Weekly RSI",
        value: latestWeeklyRsi.value,
        message: `Weekly RSI at ${latestWeeklyRsi.value} — oversold territory. Historically a strong buy zone.`,
      });
    } else if (latestWeeklyRsi.value < 40) {
      signals.push({
        type: "buy",
        strength: "moderate",
        indicator: "Weekly RSI",
        value: latestWeeklyRsi.value,
        message: `Weekly RSI at ${latestWeeklyRsi.value} — approaching oversold. Worth watching.`,
      });
    } else if (latestWeeklyRsi.value > 80) {
      signals.push({
        type: "sell",
        strength: "strong",
        indicator: "Weekly RSI",
        value: latestWeeklyRsi.value,
        message: `Weekly RSI at ${latestWeeklyRsi.value} — overbought. Consider taking some profits.`,
      });
    } else if (latestWeeklyRsi.value > 70) {
      signals.push({
        type: "sell",
        strength: "moderate",
        indicator: "Weekly RSI",
        value: latestWeeklyRsi.value,
        message: `Weekly RSI at ${latestWeeklyRsi.value} — getting hot. Monitor for peak.`,
      });
    } else {
      signals.push({
        type: "neutral",
        strength: "none",
        indicator: "Weekly RSI",
        value: latestWeeklyRsi.value,
        message: `Weekly RSI at ${latestWeeklyRsi.value} — neutral range.`,
      });
    }
  }

  // 200-day MA signal
  if (latestMa200?.value != null) {
    const pctAbove =
      ((currentPrice - latestMa200.value) / latestMa200.value) * 100;
    if (pctAbove < -20) {
      signals.push({
        type: "buy",
        strength: "strong",
        indicator: "200-Day MA",
        value: Math.round(latestMa200.value),
        maValue: latestMa200.value,
        message: `Price ${Math.abs(Math.round(pctAbove))}% below 200-day MA {ma}. Deep value territory.`,
      });
    } else if (pctAbove < 0) {
      signals.push({
        type: "buy",
        strength: "moderate",
        indicator: "200-Day MA",
        value: Math.round(latestMa200.value),
        maValue: latestMa200.value,
        message: `Price ${Math.abs(Math.round(pctAbove))}% below 200-day MA {ma}. Below long-term trend.`,
      });
    } else {
      signals.push({
        type: "neutral",
        strength: "none",
        indicator: "200-Day MA",
        value: Math.round(latestMa200.value),
        maValue: latestMa200.value,
        message: `Price ${Math.round(pctAbove)}% above 200-day MA {ma}.`,
      });
    }
  }

  // 200-week MA signal — only available once we have 200+ weeks of history
  if (latestMa200w?.value != null) {
    const pctAbove =
      ((currentPrice - latestMa200w.value) / latestMa200w.value) * 100;
    if (pctAbove < 0) {
      signals.push({
        type: "buy",
        strength: "strong",
        indicator: "200-Week MA",
        value: Math.round(latestMa200w.value),
        maValue: latestMa200w.value,
        message: `Price ${Math.abs(Math.round(pctAbove))}% BELOW 200-week MA {ma}! Historically the best buy zone in Bitcoin's history.`,
      });
    } else if (pctAbove < 50) {
      signals.push({
        type: "buy",
        strength: "moderate",
        indicator: "200-Week MA",
        value: Math.round(latestMa200w.value),
        maValue: latestMa200w.value,
        message: `Price ${Math.round(pctAbove)}% above 200-week MA {ma}. Still relatively close to long-term support.`,
      });
    } else {
      signals.push({
        type: "neutral",
        strength: "none",
        indicator: "200-Week MA",
        value: Math.round(latestMa200w.value),
        maValue: latestMa200w.value,
        message: `Price ${Math.round(pctAbove)}% above 200-week MA {ma}.`,
      });
    }
  }

  // Mayer Multiple
  if (latestMayer?.value != null) {
    if (latestMayer.value < 0.8) {
      signals.push({
        type: "buy",
        strength: "strong",
        indicator: "Mayer Multiple",
        value: latestMayer.value,
        message: `Mayer Multiple at ${latestMayer.value} — below 0.8 is historically a strong accumulation zone.`,
      });
    } else if (latestMayer.value > 2.4) {
      signals.push({
        type: "sell",
        strength: "strong",
        indicator: "Mayer Multiple",
        value: latestMayer.value,
        message: `Mayer Multiple at ${latestMayer.value} — above 2.4 historically signals overheating.`,
      });
    } else {
      signals.push({
        type: "neutral",
        strength: "none",
        indicator: "Mayer Multiple",
        value: latestMayer.value,
        message: `Mayer Multiple at ${latestMayer.value} — normal range.`,
      });
    }
  }

  // ATH drawdown
  if (athDrawdown < -60) {
    signals.push({
      type: "buy",
      strength: "strong",
      indicator: "ATH Drawdown",
      value: Math.round(athDrawdown),
      message: `${Math.round(athDrawdown)}% from ATH. Drawdowns of 60%+ have historically been prime accumulation zones.`,
    });
  } else if (athDrawdown < -40) {
    signals.push({
      type: "buy",
      strength: "moderate",
      indicator: "ATH Drawdown",
      value: Math.round(athDrawdown),
      message: `${Math.round(athDrawdown)}% from ATH. Significant correction — worth watching for further dip.`,
    });
  } else if (athDrawdown > -5) {
    signals.push({
      type: "sell",
      strength: "moderate",
      indicator: "ATH Drawdown",
      value: Math.round(athDrawdown),
      message: `Near all-time high (${Math.round(athDrawdown)}%). Historically risky to buy at peaks.`,
    });
  } else {
    signals.push({
      type: "neutral",
      strength: "none",
      indicator: "ATH Drawdown",
      value: Math.round(athDrawdown),
      message: `${Math.round(athDrawdown)}% from ATH.`,
    });
  }

  // Floor Detection — price stability + MA convergence + RSI recovery
  const convergence = maConvergence(dailyPrices, ma200);
  const rsiWithValues = weeklyRsi.filter((r) => r.value !== null);
  const last12Rsi = rsiWithValues.slice(-12);
  const hadWashout =
    last12Rsi.length >= 4 && last12Rsi.some((r) => r.value < 40);
  const last4Rsi = rsiWithValues.slice(-4);
  const avgRecent =
    last4Rsi.length === 4
      ? last4Rsi.reduce((s, r) => s + r.value, 0) / 4
      : null;
  const rsiRecovered =
    hadWashout && avgRecent != null && avgRecent >= 38 && avgRecent <= 60;
  if (convergence) {
    const gapDirection =
      convergence.gapNow < 0
        ? `${Math.abs(convergence.gapNow)}% below`
        : `${convergence.gapNow}% above`;
    if (convergence.converging && rsiRecovered) {
      signals.push({
        type: "buy",
        strength: "moderate",
        indicator: "Floor Detection",
        value: convergence.gapNow,
        message: `Price stable (${convergence.priceRange}% range over 30d) while 200-day MA converges from above (gap narrowed from ${Math.abs(convergence.gapPrev)}% to ${Math.abs(convergence.gapNow)}%). RSI recovered to ${Math.round(avgRecent * 10) / 10} avg after dipping below 40 in recent weeks. Potential natural floor forming — if other indicators suggest buying, further significant drops are less likely without new negative catalysts.`,
      });
    } else if (convergence.converging && !rsiRecovered) {
      signals.push({
        type: "neutral",
        strength: "none",
        indicator: "Floor Detection",
        value: convergence.gapNow,
        message: `Price stable and 200-day MA converging (gap ${Math.abs(convergence.gapNow)}%), but RSI ${!hadWashout ? "has not been oversold recently" : avgRecent != null && avgRecent < 38 ? `still low (4-week avg ${Math.round(avgRecent * 10) / 10})` : "not yet showing recovery"} — buying momentum not yet confirmed.`,
      });
    } else {
      signals.push({
        type: "neutral",
        strength: "none",
        indicator: "Floor Detection",
        value: convergence.gapNow,
        message: `Price ${gapDirection} 200-day MA. No convergence pattern detected.`,
      });
    }
  }

  // Overall assessment
  const buySignals = signals.filter((s) => s.type === "buy");
  const sellSignals = signals.filter((s) => s.type === "sell");
  const strongBuys = buySignals.filter((s) => s.strength === "strong").length;
  const strongSells = sellSignals.filter((s) => s.strength === "strong").length;

  let overall;
  if (strongBuys >= 3) {
    overall = {
      action: "STRONG BUY",
      description:
        "Multiple indicators showing deep value. This is the kind of dip long-term holders wait for.",
    };
  } else if (strongBuys >= 2 || buySignals.length >= 3) {
    overall = {
      action: "BUY",
      description:
        "Several indicators suggest good value. Consider accumulating.",
    };
  } else if (buySignals.length >= 2) {
    overall = {
      action: "ACCUMULATE",
      description:
        "Some buy signals present. DCA (dollar-cost average) could work here.",
    };
  } else if (strongSells >= 2) {
    overall = {
      action: "CONSIDER SELLING",
      description:
        "Multiple indicators showing overheated conditions. Consider taking some profits.",
    };
  } else if (sellSignals.length >= 2) {
    overall = {
      action: "CAUTION",
      description:
        "Some sell signals appearing. Not necessarily time to sell, but be aware of elevated risk.",
    };
  } else {
    overall = {
      action: "HOLD",
      description:
        "No strong buy or sell signals. If you already hold, stay the course.",
    };
  }

  return { signals, overall };
}
