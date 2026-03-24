/// リレーサーバーとの通信ヘルパー
/// VITE_RELAY_URL が未設定の場合はすべて null を返す（フォールバック動作）

export const RELAY_URL: string | undefined =
  (import.meta.env.VITE_RELAY_URL as string | undefined) || undefined;

export interface RelaySession {
  sessionId: string;
  receiverToken: string;
}

/// サーバーへのセッション作成リクエスト (3秒タイムアウト)
/// 失敗時は null を返し、呼び出し元はQRフォールバックへ移行する
export async function createSession(deadline: number): Promise<RelaySession | null> {
  if (!RELAY_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${RELAY_URL}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deadline }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json() as RelaySession;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws");
}

/// 受取人 WS 接続 (receiverToken で認証)
export function connectReceiverWs(
  sessionId: string,
  receiverToken: string
): WebSocket | null {
  if (!RELAY_URL) return null;
  try {
    return new WebSocket(
      `${toWsUrl(RELAY_URL)}/sessions/${sessionId}/receiver?token=${encodeURIComponent(receiverToken)}`
    );
  } catch {
    return null;
  }
}

/// 送金者 WS 接続 (QR_A から読み取った relayUrl を使用)
export function connectSenderWs(sessionId: string, relayUrl: string): WebSocket | null {
  try {
    return new WebSocket(`${toWsUrl(relayUrl)}/sessions/${sessionId}/sender`);
  } catch {
    return null;
  }
}

/// WS メッセージ型
export type RelayServerMessage =
  | { type: "peer_connected" }
  | { type: "peer_disconnected" }
  | { type: "session_expired" };

export type SenderToReceiverMessage = {
  type: "signature";
  permit: {
    chainId: number;
    token: string;
    owner: string;
    receiver: string;
    value: string;
    deadline: number;
    v: number;
    r: string;
    s: string;
  };
};

export type ReceiverToSenderMessage =
  | { type: "tx_complete"; txHash: string }
  | { type: "tx_failed"; reason: string };

export type ReceiverIncomingMessage = RelayServerMessage | SenderToReceiverMessage;
export type SenderIncomingMessage = RelayServerMessage | ReceiverToSenderMessage;
