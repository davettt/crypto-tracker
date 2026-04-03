import { useState } from "react";
import type { Signal, Overall, FearGreed } from "../types";

const EXPLAINERS: Record<string, { what: string; why: string }> = {
  "Weekly RSI": {
    what: "The Relative Strength Index measures how fast and how much price has moved recently. It ranges from 0 to 100. We use the weekly timeframe to filter out daily noise.",
    why: "Below 30 means the asset has been heavily sold — panic selling often overshoots fair value, creating buying opportunities. Above 70 means momentum is stretched — prices can still rise but risk of reversal increases. For a long-term holder, sub-30 readings have historically aligned with major bottoms.",
  },
  "200-Day MA": {
    what: "The 200-day Moving Average is the average closing price over the last 200 days. It smooths out short-term volatility and shows the long-term trend direction.",
    why: "When price falls below the 200-day MA, Bitcoin is trading below its long-term trend — it's 'on sale' relative to recent history. The further below, the better the value. When price is well above, you're paying a premium. The Mayer Multiple (below) quantifies exactly how far above or below.",
  },
  "200-Week MA": {
    what: "The 200-week Moving Average is the average price over roughly 4 years — spanning a full Bitcoin halving cycle. It represents the deepest long-term trend.",
    why: "Bitcoin has never closed a week below its 200-week MA for long. Every time it has touched or dipped below, it marked a generational buying opportunity (2015, 2018-19, 2022). This is the single most important indicator for a multi-year holder — if price is below this line, it's historically the best time to buy.",
  },
  "Mayer Multiple": {
    what: "The Mayer Multiple is simply the current price divided by the 200-day MA. A value of 1.0 means price equals the average. Below 1.0 means price is below average.",
    why: "Below 0.8 has historically been a strong accumulation zone — price is 20%+ below its long-term trend. Above 2.4 has historically preceded major corrections. This gives you a clean number to gauge how over- or under-valued Bitcoin is relative to its own trend.",
  },
  "ATH Drawdown": {
    what: "How far the current price is below Bitcoin's all-time high (ATH), expressed as a percentage.",
    why: "Bitcoin has historically dropped 60-85% from its peaks during bear markets. Drawdowns of 60%+ have been prime accumulation zones in every cycle (2011, 2014, 2018, 2022). Near the ATH (within 5%), risk is highest — that's where FOMO buying happens. The bigger the drawdown, the better the risk/reward for a long-term holder.",
  },
  "Fear & Greed": {
    what: "A composite index (0-100) measuring market sentiment from social media, volatility, volume, surveys, and Bitcoin dominance. Extreme fear = 0-25, extreme greed = 75-100.",
    why: '"Be greedy when others are fearful." When the index hits extreme fear (<20), it means most participants are panic selling — historically the best buying moments. Extreme greed (>75) means euphoria and overconfidence — historically where tops form. This measures the crowd\'s emotions, which tend to be wrong at extremes.',
  },
};

function SignalBadge({ signal }: { signal: Signal }) {
  const [showExplainer, setShowExplainer] = useState(false);
  const explainer = EXPLAINERS[signal.indicator];

  const bgColor =
    signal.type === "buy"
      ? signal.strength === "strong"
        ? "bg-green-100 border-green-300"
        : "bg-green-50 border-green-200"
      : signal.type === "sell"
        ? signal.strength === "strong"
          ? "bg-red-100 border-red-300"
          : "bg-red-50 border-red-200"
        : "bg-gray-50 border-gray-200";

  const label =
    signal.type === "buy"
      ? signal.strength === "strong"
        ? "STRONG BUY"
        : "BUY"
      : signal.type === "sell"
        ? signal.strength === "strong"
          ? "STRONG SELL"
          : "SELL"
        : "NEUTRAL";

  const labelColor =
    signal.type === "buy"
      ? "text-green-700"
      : signal.type === "sell"
        ? "text-red-700"
        : "text-gray-500";

  return (
    <div className={`rounded-lg border p-4 ${bgColor}`}>
      <div className="flex items-center justify-between">
        <button
          onClick={() => explainer && setShowExplainer((v) => !v)}
          className={`text-sm font-medium text-gray-700 ${explainer ? "cursor-pointer underline decoration-dotted underline-offset-2 hover:text-gray-900" : ""}`}
        >
          {signal.indicator} {explainer && (showExplainer ? "▾" : "▸")}
        </button>
        <span className={`text-xs font-bold ${labelColor}`}>{label}</span>
      </div>
      <p className="mt-1 text-sm text-gray-600">{signal.message}</p>
      {showExplainer && explainer && (
        <div className="mt-3 space-y-2 rounded-md bg-white/60 p-3">
          <div>
            <p className="text-xs font-semibold text-gray-500">What is it?</p>
            <p className="text-xs text-gray-600">{explainer.what}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500">
              Why does it matter?
            </p>
            <p className="text-xs text-gray-600">{explainer.why}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FearGreedGauge({ data }: { data: FearGreed }) {
  const [showExplainer, setShowExplainer] = useState(false);
  const explainer = EXPLAINERS["Fear & Greed"];

  const color =
    data.value <= 25
      ? "text-red-500"
      : data.value <= 45
        ? "text-orange-500"
        : data.value <= 55
          ? "text-yellow-500"
          : data.value <= 75
            ? "text-lime-500"
            : "text-green-500";

  const bgBar =
    data.value <= 25
      ? "bg-red-500"
      : data.value <= 45
        ? "bg-orange-500"
        : data.value <= 55
          ? "bg-yellow-500"
          : data.value <= 75
            ? "bg-lime-500"
            : "bg-green-500";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowExplainer((v) => !v)}
          className="cursor-pointer text-sm font-medium text-gray-700 underline decoration-dotted underline-offset-2 hover:text-gray-900"
        >
          Fear & Greed Index {showExplainer ? "▾" : "▸"}
        </button>
        <span className={`text-2xl font-bold ${color}`}>{data.value}</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full ${bgBar}`}
          style={{ width: `${data.value}%` }}
        />
      </div>
      <p className="mt-1 text-center text-xs text-gray-500">
        {data.classification}
      </p>
      {data.value <= 20 && (
        <p className="mt-2 text-xs text-green-600">
          Extreme fear — historically a good time to buy.
        </p>
      )}
      {showExplainer && explainer && (
        <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
          <div>
            <p className="text-xs font-semibold text-gray-500">What is it?</p>
            <p className="text-xs text-gray-600">{explainer.what}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500">
              Why does it matter?
            </p>
            <p className="text-xs text-gray-600">{explainer.why}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SignalPanel({
  signals,
  overall,
  fearGreed,
}: {
  signals: Signal[];
  overall: Overall;
  fearGreed: FearGreed;
}) {
  const overallBg =
    overall.action.includes("BUY") || overall.action === "ACCUMULATE"
      ? "bg-green-50 border-green-300"
      : overall.action.includes("SELL") || overall.action === "CAUTION"
        ? "bg-red-50 border-red-300"
        : "bg-gray-50 border-gray-200";

  const overallColor =
    overall.action.includes("BUY") || overall.action === "ACCUMULATE"
      ? "text-green-800"
      : overall.action.includes("SELL") || overall.action === "CAUTION"
        ? "text-red-800"
        : "text-gray-700";

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border-2 p-5 ${overallBg}`}>
        <div className="text-center">
          <p className={`text-2xl font-bold ${overallColor}`}>
            {overall.action}
          </p>
          <p className="mt-1 text-sm text-gray-600">{overall.description}</p>
        </div>
      </div>

      <FearGreedGauge data={fearGreed} />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Indicators
        </h3>
        {signals.map((signal) => (
          <SignalBadge key={signal.indicator} signal={signal} />
        ))}
      </div>

      <p className="text-xs text-gray-400">
        Not financial advice. Indicators are based on historical patterns that
        may not repeat. Always do your own research.
      </p>
    </div>
  );
}
