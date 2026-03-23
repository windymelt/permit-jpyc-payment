import { polygon, avalanche } from "wagmi/chains";
import type { Chain } from "viem";

export interface ChainConfig {
  chain: Chain;
  jpycAddress: `0x${string}`;
  /** デプロイ後に .env で上書きする */
  permitPaymentAddress: `0x${string}`;
}

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  // Polygon Mainnet (chainId: 137)
  [polygon.id]: {
    chain: polygon,
    jpycAddress: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",
    permitPaymentAddress: (import.meta.env.VITE_PERMIT_PAYMENT_POLYGON ??
      "0x0000000000000000000000000000000000000000") as `0x${string}`,
  },
  // Avalanche C-Chain (chainId: 43114)
  [avalanche.id]: {
    chain: avalanche,
    jpycAddress: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",
    permitPaymentAddress: (import.meta.env.VITE_PERMIT_PAYMENT_AVALANCHE ??
      "0x0000000000000000000000000000000000000000") as `0x${string}`,
  },
};

export const SUPPORTED_CHAINS = Object.values(CHAIN_CONFIGS).map((c) => c.chain);

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAIN_CONFIGS[chainId];
}
