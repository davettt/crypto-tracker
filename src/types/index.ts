// --- Asset types ---

export type AssetId =
  | "bitcoin"
  | "ethereum"
  | "solana"
  | "render-token"
  | "tron"
  | "bittensor"
  | "chainlink";

export interface AssetConfig {
  id: AssetId;
  symbol: string;
  name: string;
  decimals: number;
  fearGreed: boolean;
}

export const ASSETS: Record<AssetId, AssetConfig> = {
  bitcoin: {
    id: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    decimals: 8,
    fearGreed: true,
  },
  ethereum: {
    id: "ethereum",
    symbol: "ETH",
    name: "Ethereum",
    decimals: 6,
    fearGreed: false,
  },
  solana: {
    id: "solana",
    symbol: "SOL",
    name: "Solana",
    decimals: 4,
    fearGreed: false,
  },
  "render-token": {
    id: "render-token",
    symbol: "RENDER",
    name: "Render",
    decimals: 4,
    fearGreed: false,
  },
  tron: {
    id: "tron",
    symbol: "TRX",
    name: "TRON",
    decimals: 4,
    fearGreed: false,
  },
  bittensor: {
    id: "bittensor",
    symbol: "TAO",
    name: "Bittensor",
    decimals: 4,
    fearGreed: false,
  },
  chainlink: {
    id: "chainlink",
    symbol: "LINK",
    name: "Chainlink",
    decimals: 4,
    fearGreed: false,
  },
};

export const ASSET_LIST: AssetId[] = [
  "bitcoin",
  "ethereum",
  "solana",
  "render-token",
  "tron",
  "bittensor",
  "chainlink",
];

// --- Market data types ---

export interface CoinCurrent {
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

/** @deprecated Use CoinCurrent */
export type BtcCurrent = CoinCurrent;

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
  /**
   * Raw MA value (unrounded), in the home currency the signals were computed
   * in. When present, `message` contains a `{ma}` placeholder that the client
   * substitutes using its display currency.
   */
  maValue?: number;
}

export interface Overall {
  action: string;
  description: string;
}

export interface ExchangeRates {
  usdToHome: number;
  coinPrices: Record<string, Record<string, number>>;
}

export interface MarketOverview {
  current: CoinCurrent;
  fearGreed: FearGreed | null;
  fearGreedHistory: FearGreed[];
  signals: Signal[];
  overall: Overall;
  exchangeRates: ExchangeRates;
  homeCurrency: Currency;
  asset: AssetId;
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
  /** Source currency of the daily/weekly prices — always the home currency. */
  currency: Currency;
}

// --- Currency types ---

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

// --- Transaction / Portfolio types ---

export interface Transaction {
  id: string;
  type: "buy" | "sell";
  asset: AssetId;
  amount?: number;
  amountCrypto: number;
  price?: number;
  fee?: number;
  currency: Currency;
  // Legacy fields (pre-migration)
  amountUsd?: number;
  priceUsd?: number;
  feeUsd?: number;
  feeLocal?: number;
  amountLocal?: number;
  amountBtc?: number;
  date: string;
  notes: string;
  platform: string;
  createdAt: string;
}

export interface TaxSettings {
  marginalTaxRate: number;
  exchangeFeeRate: number;
}

export interface PortfolioSettings {
  homeCurrency: Currency;
  initialCapital: number;
  initialCapitalUsd?: number;
  needsCapitalConfirmation?: boolean;
  mode: "dca" | "lump";
  taxSettings?: TaxSettings;
}

export interface Portfolio {
  settings: PortfolioSettings;
  transactions: Transaction[];
}
