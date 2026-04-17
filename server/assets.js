/** Central asset registry — add new coins here */
export const ASSETS = {
  bitcoin: {
    id: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    coingeckoId: "bitcoin",
    decimals: 8,
    fearGreed: true,
  },
  ethereum: {
    id: "ethereum",
    symbol: "ETH",
    name: "Ethereum",
    coingeckoId: "ethereum",
    decimals: 6,
    fearGreed: false,
  },
  solana: {
    id: "solana",
    symbol: "SOL",
    name: "Solana",
    coingeckoId: "solana",
    decimals: 4,
    fearGreed: false,
  },
  "render-token": {
    id: "render-token",
    symbol: "RENDER",
    name: "Render",
    coingeckoId: "render-token",
    decimals: 4,
    fearGreed: false,
  },
  tron: {
    id: "tron",
    symbol: "TRX",
    name: "TRON",
    coingeckoId: "tron",
    decimals: 4,
    fearGreed: false,
  },
  bittensor: {
    id: "bittensor",
    symbol: "TAO",
    name: "Bittensor",
    coingeckoId: "bittensor",
    decimals: 4,
    fearGreed: false,
  },
  chainlink: {
    id: "chainlink",
    symbol: "LINK",
    name: "Chainlink",
    coingeckoId: "chainlink",
    decimals: 4,
    fearGreed: false,
  },
};

export const ASSET_IDS = Object.keys(ASSETS);
export const DEFAULT_ASSET = "bitcoin";

export function isValidAsset(id) {
  return id in ASSETS;
}
