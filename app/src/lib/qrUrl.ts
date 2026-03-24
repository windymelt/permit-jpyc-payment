import { encode, decode } from "cbor-x";

const APP_URL = import.meta.env.VITE_APP_URL ?? window.location.origin;

const METAMASK_DEEPLINK_BASE = "https://link.metamask.io/dapp/";

/// CBOR エンコードして base64url に変換し URL フラグメントに埋め込む。
/// サーバーには送信されない（# 以降はクライアント専用）。
export function encodeFragment(data: unknown): string {
  const bytes = encode(data);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeFragment<T>(fragment: string): T {
  const base64 = fragment.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return decode(bytes) as T;
}

/// https://link.metamask.io/dapp/{host}{path}{hash} 形式に変換する。
/// MetaMask がスキャンするとアプリを開きながらウォレット接続を促す。
function toMetaMaskDeepLink(url: string): string {
  const { host, pathname, hash } = new URL(url);
  return `${METAMASK_DEEPLINK_BASE}${host}${pathname}${hash}`;
}

/// 送金者が開くURL（QR_A に埋め込む）
export function senderUrl(data: unknown): string {
  const url = `${APP_URL}/sender#${encodeFragment(data)}`;
  return toMetaMaskDeepLink(url);
}

/// 受取人の確認画面URL（QR_B に埋め込む）
/// 受取人はすでにアプリを開いているため、MetaMask deep link は不要。
export function receiverConfirmUrl(data: unknown): string {
  return `${APP_URL}/receiver/confirm#${encodeFragment(data)}`;
}

/// パーマリンク用データ型（deadline を除いた QRaData のサブセット）
export interface PermalinkData {
  type: "permit-request";
  chainId: number;
  token: `0x${string}`;
  receiver: `0x${string}`;
  value: string;
  decimals: number;
}

/// 受取人のパーマリンクURL（QR表示画面を直接開く）
export function receiverRequestUrl(data: PermalinkData): string {
  return `${APP_URL}/receiver/request#${encodeFragment(data)}`;
}

/// 現在のURLフラグメントからデータを取り出す。なければ null。
export function readFragment<T>(): T | null {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  try {
    return decodeFragment<T>(hash);
  } catch {
    return null;
  }
}
