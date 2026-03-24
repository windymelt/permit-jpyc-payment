import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { polygon, avalanche } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "JPYC ペイ",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains: [polygon, avalanche],
  ssr: false,
});
