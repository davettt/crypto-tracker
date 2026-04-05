/**
 * FIFO (First In First Out) cost basis engine.
 * Pure function — takes sorted transactions for one asset, returns lots and disposals.
 */

/**
 * @param {Array} transactions — all transactions for a single asset, any order
 * @returns {{ openLots: Array, closedLots: Array, disposals: Array }}
 *
 * Each buy creates a lot: { buyTxId, date, amountCrypto, costBasis, fee, remaining }
 * Each sell consumes from oldest lots first (partial matching).
 * Each disposal: { sellTxId, sellDate, buyTxId, buyDate, amountCrypto, costBasis, proceeds, fee, gain, holdingDays, discountEligible }
 */
export function computeFIFO(transactions) {
  // Sort by date ascending, buys before sells on same day
  const sorted = [...transactions].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    // Buys before sells on same day
    if (a.type === "buy" && b.type === "sell") return -1;
    if (a.type === "sell" && b.type === "buy") return 1;
    return 0;
  });

  const lots = []; // open buy lots
  const closedLots = [];
  const disposals = [];

  for (const tx of sorted) {
    const amountCrypto = tx.amountCrypto ?? tx.amountBtc ?? 0;
    const txAmount = tx.amount ?? 0;
    const txFee = tx.fee ?? 0;

    if (tx.type === "buy") {
      lots.push({
        buyTxId: tx.id,
        date: tx.date,
        amountCrypto,
        costBasis: txAmount, // total fiat spent
        fee: txFee,
        remaining: amountCrypto,
        pricePerUnit: amountCrypto > 0 ? txAmount / amountCrypto : 0,
      });
    } else if (tx.type === "sell") {
      let remaining = amountCrypto;
      const sellProceeds = txAmount;
      const sellFee = txFee;
      // Proportion proceeds across matched lots
      const proceedsPerUnit =
        amountCrypto > 0 ? sellProceeds / amountCrypto : 0;
      const feePerUnit = amountCrypto > 0 ? sellFee / amountCrypto : 0;

      for (const lot of lots) {
        if (remaining <= 0) break;
        if (lot.remaining <= 0) continue;

        const matched = Math.min(lot.remaining, remaining);
        const matchedFraction =
          lot.amountCrypto > 0 ? matched / lot.amountCrypto : 0;
        const costBasis = lot.costBasis * matchedFraction;
        const buyFee = lot.fee * matchedFraction;
        const proceeds = matched * proceedsPerUnit;
        const sellFeePortioned = matched * feePerUnit;

        const sellDate = new Date(tx.date);
        const buyDate = new Date(lot.date);
        const holdingDays = Math.floor(
          (sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        const gain = proceeds - sellFeePortioned - costBasis;

        disposals.push({
          sellTxId: tx.id,
          sellDate: tx.date,
          buyTxId: lot.buyTxId,
          buyDate: lot.date,
          amountCrypto: matched,
          costBasis,
          buyFee,
          proceeds,
          sellFee: sellFeePortioned,
          gain,
          holdingDays,
          discountEligible: holdingDays > 365,
        });

        lot.remaining -= matched;
        remaining -= matched;

        if (lot.remaining <= 0) {
          closedLots.push({ ...lot });
        }
      }
    }
  }

  const openLots = lots.filter((l) => l.remaining > 0);

  return { openLots, closedLots, disposals };
}

/**
 * Compute Australian FY tax summary.
 * @param {Array} disposals — from computeFIFO
 * @param {string} fy — e.g. "2025-2026" meaning July 1 2025 to June 30 2026
 * @param {number} marginalTaxRate — e.g. 0.325
 * @returns {{ disposals, totalGains, totalLosses, netGain, discountAmount, taxableGain, estimatedTax }}
 */
export function computeFYSummary(disposals, fy, marginalTaxRate) {
  const [startYear] = fy.split("-").map(Number);
  const fyStart = `${startYear}-07-01`;
  const fyEnd = `${startYear + 1}-06-30`;

  const fyDisposals = disposals.filter(
    (d) => d.sellDate >= fyStart && d.sellDate <= fyEnd,
  );

  let totalGains = 0;
  let totalLosses = 0;
  let discountableGains = 0;
  let nonDiscountableGains = 0;

  for (const d of fyDisposals) {
    if (d.gain >= 0) {
      totalGains += d.gain;
      if (d.discountEligible) {
        discountableGains += d.gain;
      } else {
        nonDiscountableGains += d.gain;
      }
    } else {
      totalLosses += Math.abs(d.gain);
    }
  }

  const netGain = totalGains - totalLosses;

  // Apply losses first, then discount on remaining eligible gains
  // ATO: offset losses against gains, then apply 50% discount to remaining discountable gains
  let taxableGain = 0;
  if (netGain > 0) {
    // Losses reduce gains proportionally from both discount-eligible and non-eligible
    const lossRatio = totalGains > 0 ? (totalGains - netGain) / totalGains : 0;
    const reducedDiscountable = discountableGains * (1 - lossRatio);
    const reducedNonDiscountable = nonDiscountableGains * (1 - lossRatio);
    const discountAmount = reducedDiscountable * 0.5;
    taxableGain = reducedNonDiscountable + reducedDiscountable - discountAmount;
  }

  const discountAmount =
    netGain > 0
      ? discountableGains *
        (1 - (totalGains > 0 ? (totalGains - netGain) / totalGains : 0)) *
        0.5
      : 0;

  const estimatedTax = Math.max(0, taxableGain * marginalTaxRate);

  return {
    fy,
    fyStart,
    fyEnd,
    disposals: fyDisposals,
    totalGains,
    totalLosses,
    netGain,
    discountableGains,
    nonDiscountableGains,
    discountAmount,
    taxableGain,
    estimatedTax,
    marginalTaxRate,
  };
}

/**
 * Detect available FYs from transaction dates.
 * Returns array like ["2024-2025", "2025-2026"]
 */
export function detectFYs(transactions) {
  const fys = new Set();
  for (const t of transactions) {
    if (!t.date) continue;
    const [year, month] = t.date.split("-").map(Number);
    // FY runs July-June: July 2025 → FY 2025-2026, June 2026 → FY 2025-2026
    const fyStart = month >= 7 ? year : year - 1;
    fys.add(`${fyStart}-${fyStart + 1}`);
  }
  return [...fys].sort();
}
