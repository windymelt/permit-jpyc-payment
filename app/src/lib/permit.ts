import { type WalletClient, type PublicClient, domainSeparator } from "viem";
import { ERC20_PERMIT_ABI } from "./contracts";

export interface PermitSignatureResult {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

/// EIP-712 permit 署名を組み立てて walletClient に要求する。
/// EIP-5267 eip712Domain() 対応のトークンはそこから name/version を取得し、
/// 未対応の場合は name() + version "1" にフォールバックする。
export async function signPermit(params: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  tokenAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  spenderAddress: `0x${string}`;
  value: bigint;
  deadline: bigint;
  chainId: number;
}): Promise<PermitSignatureResult> {
  const {
    walletClient,
    publicClient,
    tokenAddress,
    ownerAddress,
    spenderAddress,
    value,
    deadline,
    chainId,
  } = params;

  // EIP-5267 eip712Domain() からドメイン情報を取得（対応していなければ name() にフォールバック）
  let domainName: string;
  let domainVersion: string;
  try {
    const result = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_PERMIT_ABI,
      functionName: "eip712Domain",
    });
    // result: [fields, name, version, chainId, verifyingContract, salt, extensions]
    domainName = result[1];
    domainVersion = result[2];
  } catch {
    // eip712Domain() 未対応の場合、name() と version() から取得する
    // version() も未対応なら "1" にフォールバック
    const name = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_PERMIT_ABI,
      functionName: "name",
    });
    domainName = name as string;
    try {
      const ver = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_PERMIT_ABI,
        functionName: "version",
      });
      domainVersion = ver as string;
    } catch {
      domainVersion = "1";
    }
  }

  const nonce = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_PERMIT_ABI,
    functionName: "nonces",
    args: [ownerAddress],
  });

  const domain = {
    name: domainName,
    version: domainVersion,
    chainId,
    verifyingContract: tokenAddress,
  } as const;

  // DOMAIN_SEPARATOR 検証: 構築したドメインがコントラクトと一致するか確認する
  const computedSeparator = domainSeparator({ domain });
  const onChainSeparator = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_PERMIT_ABI,
    functionName: "DOMAIN_SEPARATOR",
  }) as `0x${string}`;

  if (computedSeparator !== onChainSeparator) {
    console.error(
      "DOMAIN_SEPARATOR mismatch",
      { computed: computedSeparator, onChain: onChainSeparator, domain }
    );
    throw new Error(
      `DOMAIN_SEPARATOR が一致しません。` +
      ` domain: name="${domainName}", version="${domainVersion}", chainId=${chainId}` +
      ` computed=${computedSeparator}` +
      ` onChain=${onChainSeparator}`
    );
  }

  const types = {
    Permit: [
      { name: "owner",    type: "address" },
      { name: "spender",  type: "address" },
      { name: "value",    type: "uint256" },
      { name: "nonce",    type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  } as const;

  const message = {
    owner:    ownerAddress,
    spender:  spenderAddress,
    value,
    nonce:    nonce as bigint,
    deadline,
  };

  const signature = await walletClient.signTypedData({
    account: ownerAddress,
    domain,
    types,
    primaryType: "Permit",
    message,
  });

  // signature は 65バイト (0x + 130 hex chars): r(32) + s(32) + v(1)
  const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
  const v = parseInt(signature.slice(130, 132), 16);

  return { v, r, s };
}
