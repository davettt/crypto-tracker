export interface BtcCurrent {
  price: number;
  priceUsd: number;
  ath: number;
  athDate: string;
  athChange: number;
  marketCap: number;
  totalVolume: number;
  high24h: number;
  low24h: number;
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

export interface ExchangeRates {
  usdToHome: number;
  btcPrices: Record<string, number>;
}

export interface MarketOverview {
  current: BtcCurrent;
  fearGreed: FearGreed;
  fearGreedHistory: FearGreed[];
  signals: Signal[];
  overall: Overall;
  exchangeRates: ExchangeRates;
  homeCurrency: Currency;
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

export type Currency =
  | "USD"
  | "AUD"
  | "GBP"
  | "EUR"
  | "JPY"
  | "NZD"
  | "SGD"
  | "CAD";

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: "$",
  AUD: "A$",
  GBP: "\u00a3",
  EUR: "\u20ac",
  JPY: "\u00a5",
  NZD: "NZ$",
  SGD: "S$",
  CAD: "C$",
};

export const CURRENCIES: Currency[] = [
  "USD",
  "AUD",
  "GBP",
  "EUR",
  "JPY",
  "NZD",
  "SGD",
  "CAD",
];

export interface Transaction {
  id: string;
  type: "buy" | "sell";
  amount?: number;
  amountBtc: number;
  price?: number;
  fee?: number;
  currency: Currency;
  // Legacy fields (pre-migration)
  amountUsd?: number;
  priceUsd?: number;
  feeUsd?: number;
  feeLocal?: number;
  amountLocal?: number;
  date: string;
  notes: string;
  createdAt: string;
}

export interface PortfolioSettings {
  homeCurrency: Currency;
  initialCapital: number;
  initialCapitalUsd?: number;
  needsCapitalConfirmation?: boolean;
  mode: "dca" | "lump";
}

export interface Portfolio {
  settings: PortfolioSettings;
  transactions: Transaction[];
}
