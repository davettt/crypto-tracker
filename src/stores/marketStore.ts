import { create } from "zustand";
import type { MarketOverview, ChartData, Currency } from "../types";

interface MarketState {
  overview: MarketOverview | null;
  chartData: ChartData | null;
  loading: boolean;
  error: string | null;
  homeCurrency: Currency;
  displayCurrency: Currency;
  setDisplayCurrency: (c: Currency) => void;
  setHomeCurrency: (c: Currency) => void;
  fetchOverview: () => Promise<void>;
  fetchChart: () => Promise<void>;
}

export const useMarketStore = create<MarketState>((set) => ({
  overview: null,
  chartData: null,
  loading: false,
  error: null,
  homeCurrency: "USD",
  displayCurrency: "USD",

  setDisplayCurrency: (displayCurrency) => set({ displayCurrency }),
  setHomeCurrency: (homeCurrency) =>
    set({ homeCurrency, displayCurrency: homeCurrency }),

  fetchOverview: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/market/overview");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      const hc = data.homeCurrency ?? "USD";
      set((state) => ({
        overview: data,
        homeCurrency: hc,
        // Only set displayCurrency to homeCurrency on first load
        displayCurrency: state.overview === null ? hc : state.displayCurrency,
        loading: false,
      }));
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
