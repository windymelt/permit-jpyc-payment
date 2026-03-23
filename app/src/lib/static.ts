// JPYC
export const JPYC_DECIMALS = 18;
export const JPYC_ALLOWLIST_THRESHOLD = 100_000n * 10n ** BigInt(JPYC_DECIMALS);

// ネイティブトークン
export const NATIVE_DECIMALS = 18;

// チェーン
export const CHAIN_ID_POLYGON = 137;
export const CHAIN_ID_AVALANCHE = 43114;
export const NATIVE_SYMBOL: Record<number, string> = {
  [CHAIN_ID_POLYGON]:  "MATIC",
  [CHAIN_ID_AVALANCHE]: "AVAX",
};

// デフォルト値
export const DEFAULT_DEADLINE_MINUTES = 10;
