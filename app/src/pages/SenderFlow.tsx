import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWalletClient, usePublicClient, useAccount, useChainId, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import QRDisplay from "../components/QRDisplay";
import QRScanner from "../components/QRScanner";
import { signPermit } from "../lib/permit";
import { getChainConfig } from "../lib/chains";
import { ERC20_ABI } from "../lib/contracts";
import { receiverConfirmUrl, readFragment, decodeFragment } from "../lib/qrUrl";
import {
  connectSenderWs,
  type SenderToReceiverMessage,
  type SenderIncomingMessage,
} from "../lib/relay";


type Step = "S-1" | "S-2" | "S-3";

interface QRaData {
  type: "permit-request";
  chainId: number;
  token: `0x${string}`;
  receiver: `0x${string}`;
  value: string;
  decimals: number;
  deadline: number;
  sessionId?: string;
  relayUrl?: string;
}

interface QRbData {
  type: "permit-signature";
  chainId: number;
  token: `0x${string}`;
  owner: `0x${string}`;
  receiver: `0x${string}`;
  value: string;
  deadline: number;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

const styles = {
  root: {
    padding: "24px 0",
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    background: "none",
    border: "none",
    fontSize: 20,
    cursor: "pointer",
    padding: 4,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700 },
  card: {
    background: "white",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  row: { display: "flex", justifyContent: "space-between", marginBottom: 8 },
  label: { color: "#6c757d", fontSize: 14 },
  value: { fontWeight: 600, fontSize: 14, wordBreak: "break-all" as const },
  button: {
    width: "100%",
    padding: "14px 0",
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    background: "#198754",
    color: "white",
  },
  errorText: { color: "#dc3545", fontSize: 14 },
  hint: { color: "#6c757d", fontSize: 14, margin: 0, textAlign: "center" as const },
} as const;

export default function SenderFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("S-1");
  const [qrAData, setQrAData] = useState<QRaData | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>("");
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [qrBUrl, setQrBUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [txComplete, setTxComplete] = useState<string | null>(null); // txHash
  const [relayConnected, setRelayConnected] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  // フラグメント確認が完了するまで QRScanner をマウントしない
  // (フラグメントありの場合は S-2 へ遷移するためスキャナーは不要)
  const [scannerReady, setScannerReady] = useState(false);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // /sender#<base64(QR_A)> で直接開かれた場合、フラグメントからデータを読んで S-2 へ
  // フラグメントがない場合のみ scannerReady を true にしてスキャナーを表示する
  useEffect(() => {
    const data = readFragment<QRaData>();
    if (!data || data.type !== "permit-request") {
      setScannerReady(true);
      return;
    }
    loadQrAData(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadQrAData = useCallback(
    async (data: QRaData) => {
      setError(null);
      setTokenDecimals(data.decimals);
      // シンボルはオンチェーンから取得（失敗しても表示には影響しない）
      if (publicClient) {
        publicClient.readContract({
          address: data.token,
          abi: ERC20_ABI,
          functionName: "symbol",
        }).then((sym) => setTokenSymbol(sym as string)).catch(() => setTokenSymbol(""));
      }
      setQrAData(data);
      setStep("S-2");
    },
    [publicClient]
  );

  // qrAData が確定したら必要に応じてチェーンを切り替える
  // （MetaMask deep link 経由で開いた場合、手動スキャン時のチェーン切り替えが走らないため）
  useEffect(() => {
    if (!qrAData || chainId === qrAData.chainId) return;
    switchChain({ chainId: qrAData.chainId }, {
      onError: () => setError(`チェーンを ${qrAData.chainId} に切り替えてください`),
    });
  }, [qrAData, chainId, switchChain]);

  // qrAData と address が揃ったらトークン残高を取得する
  useEffect(() => {
    if (!qrAData || !address || !publicClient) return;
    setTokenBalance(null);
    publicClient
      .readContract({ address: qrAData.token, abi: ERC20_ABI, functionName: "balanceOf", args: [address] })
      .then((bal) => setTokenBalance(bal as bigint))
      .catch(() => setTokenBalance(null));
  }, [qrAData, address, publicClient]);

  // S-1: QR_A スキャン（手動スキャン時のフォールバック）
  const handleQRAScan = useCallback(
    async (text: string) => {
      setError(null);

      // URL形式（新方式）とJSON形式（後方互換）の両方に対応
      let data: QRaData;
      try {
        if (text.includes("#")) {
          const fragment = text.split("#")[1];
          data = decodeFragment<QRaData>(fragment);
        } else {
          data = JSON.parse(text) as QRaData;
        }
        if (data.type !== "permit-request") throw new Error("invalid QR type");
      } catch {
        setError("QRコードの形式が正しくありません");
        return;
      }

      if (chainId !== data.chainId) {
        try {
          await switchChain({ chainId: data.chainId });
        } catch {
          setError(`チェーンを ${data.chainId} に切り替えてください`);
          return;
        }
      }

      await loadQrAData(data);
    },
    [chainId, switchChain, loadQrAData]
  );

  // S-3: permit 署名
  const handleSign = useCallback(async () => {
    if (!qrAData || !walletClient || !publicClient || !address) return;

    const chainConfig = getChainConfig(qrAData.chainId);
    if (!chainConfig) {
      setError(`非対応チェーン: ${qrAData.chainId}`);
      return;
    }

    setSigning(true);
    setError(null);
    try {
      const { v, r, s } = await signPermit({
        walletClient,
        publicClient,
        tokenAddress: qrAData.token,
        ownerAddress: address,
        spenderAddress: chainConfig.permitPaymentAddress,
        value: BigInt(qrAData.value),
        deadline: BigInt(qrAData.deadline),
        chainId: qrAData.chainId,
      });

      const qrB: QRbData = {
        type: "permit-signature",
        chainId: qrAData.chainId,
        token: qrAData.token,
        owner: address,
        receiver: qrAData.receiver,
        value: qrAData.value,
        deadline: qrAData.deadline,
        v,
        r,
        s,
      };
      setQrBUrl(receiverConfirmUrl(qrB));
      setStep("S-3");

      // リレーが使えれば署名データを送信し、完了通知を待機する
      if (qrAData.sessionId && qrAData.relayUrl) {
        const ws = connectSenderWs(qrAData.sessionId, qrAData.relayUrl);
        if (ws) {
          ws.onopen = () => {
            setRelayConnected(true);
            const msg: SenderToReceiverMessage = {
              type: "signature",
              permit: { ...qrB },
            };
            ws.send(JSON.stringify(msg));
          };
          ws.onmessage = (event: MessageEvent<string>) => {
            let incoming: SenderIncomingMessage;
            try {
              incoming = JSON.parse(event.data) as SenderIncomingMessage;
            } catch {
              return;
            }
            if (incoming.type === "tx_complete") {
              setTxComplete(incoming.txHash);
              ws.close();
            }
          };
          ws.onerror = () => setRelayConnected(false);
          ws.onclose = () => setRelayConnected(false);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "署名に失敗しました");
    } finally {
      setSigning(false);
    }
  }, [qrAData, walletClient, publicClient, address]);

  const formattedAmount =
    qrAData
      ? `${formatUnits(BigInt(qrAData.value), tokenDecimals)} ${tokenSymbol}`
      : "";

  const deadlineStr = qrAData
    ? new Date(qrAData.deadline * 1000).toLocaleString("ja-JP")
    : "";

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => navigate("/")}>
          &#8592;
        </button>
        <h2 style={styles.title}>
          おくる
          {step === "S-1" && " - QRスキャン"}
          {step === "S-2" && " - 内容確認"}
          {step === "S-3" && " - 署名完了"}
        </h2>
      </div>

      {!isConnected && (
        <div style={styles.card}>
          <p style={{ margin: "0 0 12px" }}>ウォレットを接続してください</p>
          <ConnectButton />
        </div>
      )}

      {/* S-1: 手動スキャン（QR_A URLから開かれなかった場合のフォールバック） */}
      {/* scannerReady はフラグメント確認後に true になる。フラグメントありの場合は */}
      {/* S-2 へ遷移済みのためスキャナーは表示されない。 */}
      {step === "S-1" && scannerReady && isConnected && (
        <>
          <div style={styles.card}>
            <p style={styles.hint}>
              受取人のQRコードをスキャンしてください。
              <br />
              カメラアプリから直接開くこともできます。
            </p>
          </div>
          <QRScanner onResult={handleQRAScan} onError={(e) => setError(e.message)} />
          {error && <p style={styles.errorText}>{error}</p>}
        </>
      )}

      {/* S-2: 内容確認 */}
      {step === "S-2" && qrAData && (
        <>
          {/* 残高推移表示 */}
          <div style={{ ...styles.card, textAlign: "center" as const }}>
            {tokenBalance === null ? (
              <p style={{ margin: 0, fontSize: 15, color: "#6c757d" }}>残高取得中...</p>
            ) : (() => {
              const after = tokenBalance - BigInt(qrAData.value);
              const fmtBefore = formatUnits(tokenBalance, tokenDecimals);
              const fmtAfter = formatUnits(after >= 0n ? after : 0n, tokenDecimals);
              const insufficient = after < 0n;
              return (
                <p style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "0.01em" }}>
                  <span>{Number(fmtBefore).toLocaleString("ja-JP", { maximumFractionDigits: 6 })} {tokenSymbol}</span>
                  <span style={{ margin: "0 10px", color: "#6c757d", fontWeight: 400 }}>→</span>
                  <span style={{ color: insufficient ? "#dc3545" : "#198754" }}>
                    {insufficient ? "残高不足" : `${Number(fmtAfter).toLocaleString("ja-JP", { maximumFractionDigits: 6 })} ${tokenSymbol}`}
                  </span>
                </p>
              );
            })()}
          </div>

          <div style={styles.card}>
            <div style={styles.row}>
              <span style={styles.label}>送り先</span>
              <span style={styles.value}>{qrAData.receiver}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>トークン</span>
              <span style={styles.value}>{qrAData.token}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>金額</span>
              <span style={styles.value}>{formattedAmount}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>有効期限</span>
              <span style={styles.value}>{deadlineStr}</span>
            </div>
          </div>

          <div style={{ background: "#e8f4fd", border: "1px solid #b6d4fe", borderRadius: 8, padding: 12, fontSize: 13, color: "#084298" }}>
            MetaMask の署名画面で「無制限」と表示されることがありますが、実際に承認される金額は上記の通りです。
          </div>

          {error && <p style={styles.errorText}>{error}</p>}

          <button style={styles.button} onClick={handleSign} disabled={signing || !isConnected}>
            {signing ? "署名中..." : "署名する"}
          </button>
        </>
      )}

      {/* S-3: 署名完了 */}
      {step === "S-3" && qrBUrl && (
        <>
          {/* 送金完了通知 (リレー経由) */}
          {txComplete && (() => {
            const cfg = qrAData ? getChainConfig(qrAData.chainId) : undefined;
            const explorerUrl = cfg ? `${cfg.explorerTxUrl}${txComplete}` : undefined;
            return (
              <div style={{
                background: "#d1e7dd",
                border: "1px solid #a3cfbb",
                borderRadius: 12,
                padding: 20,
                textAlign: "center",
              }}>
                <p style={{ fontWeight: 700, fontSize: 18, margin: "0 0 8px" }}>送金完了</p>
                <p style={{ fontSize: 13, color: "#0a3622", margin: "0 0 12px" }}>
                  受取人が送金トランザクションを実行しました。
                </p>
                <p style={{ margin: "0 0 6px", fontSize: 13 }}>トランザクションハッシュ:</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: explorerUrl ? 12 : 0 }}>
                  <p style={{ fontFamily: "monospace", fontSize: 11, wordBreak: "break-all", margin: 0, flex: 1, minWidth: 0 }}>
                    {txComplete}
                  </p>
                  <button
                    style={{
                      padding: "4px 10px",
                      fontSize: 13,
                      border: "1px solid #ccc",
                      borderRadius: 6,
                      background: "#f5f5f5",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => navigator.clipboard.writeText(txComplete)}
                  >
                    コピー
                  </button>
                </div>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 14, color: "#1a73e8", textDecoration: "underline" }}
                  >
                    エクスプローラーで確認する
                  </a>
                )}
                <div style={{ marginTop: 16 }}>
                  <button
                    style={{
                      padding: "10px 28px",
                      fontSize: 15,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      background: "#6c757d",
                      color: "white",
                    }}
                    onClick={() => window.close()}
                  >
                    閉じる
                  </button>
                </div>
              </div>
            );
          })()}

          {/* リレー待機中 or 非リレー: QR_B を表示 */}
          {!txComplete && (
            <>
              {relayConnected && (
                <div style={styles.card}>
                  <p style={{ ...styles.hint, textAlign: "center" }}>
                    署名データを送信しました。受取人の処理をお待ちください...
                  </p>
                </div>
              )}
              <QRDisplay
                value={qrBUrl}
                label={relayConnected ? "受取人がオフラインの場合はQRをスキャンしてもらってください" : "受取人にスキャンしてもらってください"}
              />
              {!relayConnected && (
                <p style={styles.hint}>
                  受取人がスキャンすると送信確認画面が開きます。
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
