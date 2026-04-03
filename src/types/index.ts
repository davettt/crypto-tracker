export interface BtcCurrent {
  price: number;
  priceAud: number;
  ath: number;
  athDate: string;
  athChange: number;
  marketCap: number;
  totalVolume: number;
  high24h: number;
  low24h: number;
  high24hAud: number;
  low24hAud: number;
  priceChange24h: number;
  priceChange7d: number;
  priceChange30d: number;
}

export interface FearGreed {
  value: number;
  classification: string;
  date: string;
}

export interface Signal {
  type: "buy" | "sell" | "neutral";
  strength: "strong" | "moderate" | "none";
  indicator: string;
  value: number;
  message: string;
}

export interface Overall {
  action: string;
  description: string;
}

export interface ExchangeRate {
  usdToAud: number;
}

export interface MarketOverview {
  current: BtcCurrent;
  fearGreed: FearGreed;
  fearGreedHistory: FearGreed[];
  signals: Signal[];
  overall: Overall;
  exchangeRate: ExchangeRate;
}

export interface DailyDataPoint {
  date: string;
  price: number;
  ma200: number | null;
  mayer: number | null;
}

export interface WeeklyDataPoint {
  date: string;
  price: number;
  rsi: number | null;
}

export interface ChartData {
  daily: DailyDataPoint[];
  weekly: WeeklyDataPoint[];
}

export type Currency = "USD" | "AUD";

export interface Transaction {
  id: string;
  type: "buy" | "sell";
  amountUsd: number;
  amountBtc: number;
  priceUsd: number;
  feeUsd?: number;
  feeLocal?: number;
  currency: Currency;
  amountLocal: number;
  date: string;
  notes: string;
  createdAt: string;
}

export interface PortfolioSettings {
  initialCapitalUsd: number;
  mode: "dca" | "lump";
}

export interface Portfolio {
  settings: PortfolioSettings;
  transactions: Transaction[];
}
