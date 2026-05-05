/** Central asset registry — add new coins here */
export const ASSETS = {
  bitcoin: {
    id: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    coingeckoId: "bitcoin",
    decimals: 8,
    fearGreed: true,
    description:
      "Decentralised digital store of value — the original cryptocurrency",
  },
  ethereum: {
    id: "ethereum",
    symbol: "ETH",
    name: "Ethereum",
    coingeckoId: "ethereum",
    decimals: 6,
    fearGreed: false,
    description:
      "Programmable blockchain powering smart contracts, DeFi, and NFTs",
  },
  solana: {
    id: "solana",
    symbol: "SOL",
    name: "Solana",
    coingeckoId: "solana",
    decimals: 4,
    fearGreed: false,
    description:
      "High-throughput L1 blockchain optimised for speed and low fees",
  },
  "render-token": {
    id: "render-token",
    symbol: "RENDER",
    name: "Render",
    coingeckoId: "render-token",
    decimals: 4,
    fearGreed: false,
    description:
      "Decentralised GPU rendering network connecting artists with GPU providers",
  },
  tron: {
    id: "tron",
    symbol: "TRX",
    name: "TRON",
    coingeckoId: "tron",
    decimals: 4,
    fearGreed: false,
    description:
      "High-throughput blockchain dominant in USDT stablecoin transfers",
  },
  bittensor: {
    id: "bittensor",
    symbol: "TAO",
    name: "Bittensor",
    coingeckoId: "bittensor",
    decimals: 4,
    fearGreed: false,
    description:
      "Decentralised AI network rewarding machine learning model contributions",
  },
  chainlink: {
    id: "chainlink",
    symbol: "LINK",
    name: "Chainlink",
    coingeckoId: "chainlink",
    decimals: 4,
    fearGreed: false,
    description:
      "Decentralised oracle network bridging blockchains with real-world data",
  },
  near: {
    id: "near",
    symbol: "NEAR",
    name: "NEAR Protocol",
    coingeckoId: "near",
    decimals: 4,
    fearGreed: false,
    description:
      "L1 blockchain with dedicated AI division, co-founded by Transformer paper co-author",
  },
};

export const ASSET_IDS = Object.keys(ASSETS);
export const DEFAULT_ASSET = "bitcoin";

export function isValidAsset(id) {
  return id in ASSETS;
}
