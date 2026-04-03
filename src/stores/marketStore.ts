import { create } from "zustand";
import type { MarketOverview, ChartData, Currency } from "../types";

interface MarketState {
  overview: MarketOverview | null;
  chartData: ChartData | null;
  loading: boolean;
  error: string | null;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  fetchOverview: () => Promise<void>;
  fetchChart: () => Promise<void>;
}

export const useMarketStore = create<MarketState>((set) => ({
  overview: null,
  chartData: null,
  loading: false,
  error: null,
  currency: "USD",

  setCurrency: (currency) => set({ currency }),

  fetchOverview: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/market/overview");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      set({ overview: data, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  fetchChart: async () => {
    try {
      const res = await fetch("/api/market/chart");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      set({ chartData: data });
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
