import { create } from "zustand";
import type { MarketOverview, ChartData, Currency, AssetId } from "../types";

interface MarketState {
  overviewByAsset: Partial<Record<AssetId, MarketOverview>>;
  chartByAsset: Partial<Record<AssetId, ChartData>>;
  activeAsset: AssetId;
  loading: boolean;
  error: string | null;
  homeCurrency: Currency;
  displayCurrency: Currency;
  setActiveAsset: (a: AssetId) => void;
  setDisplayCurrency: (c: Currency) => void;
  setHomeCurrency: (c: Currency) => void;
  fetchOverview: (asset?: AssetId) => Promise<void>;
  fetchChart: (asset?: AssetId) => Promise<void>;
  // Convenience getters
  overview: MarketOverview | null;
  chartData: ChartData | null;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  overviewByAsset: {},
  chartByAsset: {},
  activeAsset: "bitcoin",
  loading: false,
  error: null,
  homeCurrency: "USD",
  displayCurrency: "USD",

  get overview() {
    return get().overviewByAsset[get().activeAsset] ?? null;
  },
  get chartData() {
    return get().chartByAsset[get().activeAsset] ?? null;
  },

  setActiveAsset: (activeAsset) => set({ activeAsset }),
  setDisplayCurrency: (displayCurrency) => set({ displayCurrency }),
  setHomeCurrency: (homeCurrency) =>
    set({ homeCurrency, displayCurrency: homeCurrency }),

  fetchOverview: async (asset?: AssetId) => {
    const targetAsset = asset ?? get().activeAsset;
    set({ loading: true, error: null });
    try {
      const res = await fetch(
        `/api/market/overview?asset=${encodeURIComponent(targetAsset)}`,
      );
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data: MarketOverview = await res.json();
      const hc = data.homeCurrency ?? "USD";
      set((state) => ({
        overviewByAsset: { ...state.overviewByAsset, [targetAsset]: data },
        homeCurrency: hc,
        displayCurrency:
          Object.keys(state.overviewByAsset).length === 0
            ? hc
            : state.displayCurrency,
        loading: false,
      }));
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  fetchChart: async (asset?: AssetId) => {
    const targetAsset = asset ?? get().activeAsset;
    try {
      const res = await fetch(
        `/api/market/chart?asset=${encodeURIComponent(targetAsset)}`,
      );
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data: ChartData = await res.json();
      set((state) => ({
        chartByAsset: { ...state.chartByAsset, [targetAsset]: data },
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
