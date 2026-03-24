import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits, parseUnits } from "viem";
import QRDisplay from "../components/QRDisplay";
import { getChainConfig, CHAIN_CONFIGS } from "../lib/chains";
import { PERMIT_PAYMENT_ABI, ERC20_ABI } from "../lib/contracts";
import QRScanner from "../components/QRScanner";
import { senderUrl, readFragment, decodeFragment, receiverRequestUrl, type PermalinkData } from "../lib/qrUrl";
import {
  createSession,
  connectReceiverWs,
  RELAY_URL,
  type RelaySession,
  type ReceiverIncomingMessage,
  type ReceiverToSenderMessage,
} from "../lib/relay";
import {
  JPYC_DECIMALS,
  JPYC_ALLOWLIST_THRESHOLD,
  NATIVE_DECIMALS,
  NATIVE_SYMBOL,
  DEFAULT_DEADLINE_MINUTES,
} from "../lib/static";

type Step = "R-1" | "R-2" | "R-2b" | "R-3" | "R-4";

interface QRaData {
  type: "permit-request";
  chainId: number;
  token: `0x${string}`;
  receiver: `0x${string}`;
  value: string;
  decimals: number;
  deadline: number;
  sessionId?: string;   // リレーセッションID (リレー利用時のみ)
  relayUrl?: string;    // リレーサーバーURL (リレー利用時のみ)
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
  formGroup: { display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: 600, color: "#495057" },
  input: {
    padding: "10px 12px",
    fontSize: 14,
    border: "1px solid #ced4da",
    borderRadius: 8,
    outline: "none",
  },
  select: {
    padding: "10px 12px",
    fontSize: 14,
    border: "1px solid #ced4da",
    borderRadius: 8,
    background: "white",
    outline: "none",
  },
  warning: {
    background: "#fff3cd",
    border: "1px solid #ffc107",
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: "#856404",
  },
  button: {
    width: "100%",
    padding: "14px 0",
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    background: "#0d6efd",
    color: "white",
  },
  infoRow: { display: "flex", justifyContent: "space-between", marginBottom: 8 },
  infoLabel: { color: "#6c757d", fontSize: 14 },
  infoValue: { fontWeight: 600, fontSize: 14, wordBreak: "break-all" as const },
  txHash: {
    fontFamily: "monospace",
    fontSize: 12,
    wordBreak: "break-all" as const,
    color: "#0d6efd",
  },
  errorText: { color: "#dc3545", fontSize: 14 },
  successCard: {
    background: "#d1e7dd",
    border: "1px solid #a3cfbb",
    borderRadius: 12,
    padding: 20,
    textAlign: "center" as const,
  },
  hint: { color: "#6c757d", fontSize: 14, margin: 0 },
} as const;

interface Props {
  initialStep?: Step;
}

export default function ReceiverFlow({ initialStep = "R-1" }: Props) {
  const navigate = useNavigate();
  const { address, isConnected, chainId: connectedChainId } = useAccount();
  const publicClient = usePublicClient();

  const [step, setStep] = useState<Step>(initialStep);

  // R-1 フォーム入力
  const [selectedChainId, setSelectedChainId] = useState<number>(
    connectedChainId ?? 137
  );
  const [tokenMode, setTokenMode] = useState<"jpyc" | "manual">("jpyc");
  const [tokenAddress, setTokenAddress] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [decimals, setDecimals] = useState<number>(JPYC_DECIMALS);
  const [deadlineMinutes, setDeadlineMinutes] = useState<number>(DEFAULT_DEADLINE_MINUTES);
  const [tokenSymbol, setTokenSymbol] = useState<string>("");
  const [qrAData, setQrAData] = useState<QRaData | null>(null);
  const [qrBData, setQrBData] = useState<QRbData | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState<string | null>(null);

  // リレー関連
  const [relaySession, setRelaySession] = useState<RelaySession | null>(null);
  const relayWsRef = useRef<WebSocket | null>(null);

  // QR_A カウントダウン表示
  const [countdown, setCountdown] = useState<string>("");

  const chainConfig = getChainConfig(selectedChainId);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // /receiver/request#<base64(PermalinkData)> で直接開かれた場合、フラグメントからデータを読む
  useEffect(() => {
    if (initialStep !== "R-2") return;
    const permalinkData = readFragment<PermalinkData>();
    if (!permalinkData || permalinkData.type !== "permit-request") {
      setFormError("URLが無効です");
      return;
    }
    const deadline = Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_MINUTES * 60;
    setSelectedChainId(permalinkData.chainId);
    setDecimals(permalinkData.decimals);

    // リレーセッション作成を試みてからQRデータを確定する
    createSession(deadline).then((session) => {
      if (session) setRelaySession(session);
      setQrAData({
        ...permalinkData,
        deadline,
        ...(session && RELAY_URL ? { sessionId: session.sessionId, relayUrl: RELAY_URL } : {}),
      });
    });
  }, [initialStep]);

  // /receiver/confirm#<base64(QR_B)> で直接開かれた場合、フラグメントからデータを読む
  useEffect(() => {
    if (initialStep !== "R-3") return;
    const data = readFragment<QRbData>();
    if (!data || data.type !== "permit-signature") {
      setFormError("URLが無効です");
      return;
    }
    setQrBData(data);
    setSelectedChainId(data.chainId);
    setDecimals(JPYC_DECIMALS);
  }, [initialStep]);

  // パーマリンクフローではトークンシンボルが未取得のため、qrAData 確定時に取得する
  useEffect(() => {
    if (!qrAData || tokenSymbol || !publicClient) return;
    publicClient
      .readContract({ address: qrAData.token, abi: ERC20_ABI, functionName: "symbol" })
      .then((sym) => setTokenSymbol(sym as string))
      .catch(() => {});
  }, [qrAData, tokenSymbol, publicClient]);

  // QR_A 表示中: deadline までのカウントダウンを毎秒更新する
  useEffect(() => {
    if (!qrAData) return;
    const update = () => {
      const remaining = qrAData.deadline - Math.floor(Date.now() / 1000);
      if (remaining <= 0) {
        setCountdown("期限切れ");
        return;
      }
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      setCountdown(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [qrAData]);

  // リレーセッション確立時に WS 接続し、署名データを待機する
  useEffect(() => {
    if (!relaySession) return;
    const ws = connectReceiverWs(relaySession.sessionId, relaySession.receiverToken);
    if (!ws) return;
    relayWsRef.current = ws;

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: ReceiverIncomingMessage;
      try {
        msg = JSON.parse(event.data) as ReceiverIncomingMessage;
      } catch {
        return;
      }
      if (msg.type === "signature") {
        // 署名データが届いたので自動的に R-3 へ遷移
        const p = msg.permit;
        setQrBData({
          type: "permit-signature",
          chainId: p.chainId,
          token: p.token as `0x${string}`,
          owner: p.owner as `0x${string}`,
          receiver: p.receiver as `0x${string}`,
          value: p.value,
          deadline: p.deadline,
          v: p.v,
          r: p.r as `0x${string}`,
          s: p.s as `0x${string}`,
        });
        setSelectedChainId(p.chainId);
        setStep("R-3");
      }
    };

    ws.onerror = () => {
      relayWsRef.current = null;
    };

    return () => {
      ws.close();
      relayWsRef.current = null;
    };
  }, [relaySession]);

  // R-4 に移行し、リレーで完了通知を送金者へ送る
  useEffect(() => {
    if (isTxSuccess && step === "R-3") {
      setStep("R-4");
      if (txHash && relayWsRef.current?.readyState === WebSocket.OPEN) {
        const msg: ReceiverToSenderMessage = { type: "tx_complete", txHash };
        relayWsRef.current.send(JSON.stringify(msg));
        relayWsRef.current.close();
        relayWsRef.current = null;
      }
    }
  }, [isTxSuccess, step, txHash]);

  // JPYC モード時: チェーン変更に追従してアドレスを自動設定する
  useEffect(() => {
    if (tokenMode !== "jpyc") return;
    const cfg = getChainConfig(selectedChainId);
    if (cfg) {
      setTokenAddress(cfg.jpycAddress);
      setTokenSymbol("JPYC");
    } else {
      setTokenAddress("");
      setTokenSymbol("");
    }
  }, [tokenMode, selectedChainId]);

  // R-1: QR_A 生成
  const handleCreateRequest = useCallback(async () => {
    setFormError(null);

    if (!address) {
      setFormError("ウォレットを接続してください");
      return;
    }
    if (!tokenAddress.startsWith("0x")) {
      setFormError("トークンアドレスを正しく入力してください");
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setFormError("金額を正しく入力してください");
      return;
    }

    let dec = decimals;
    let sym = tokenSymbol;

    // decimals は常にコントラクトから取得する（ハードコード値に依存しない）
    if (publicClient) {
      setLoadingToken(true);
      try {
        const [fetchedSym, fetchedDec] = await Promise.all([
          publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "symbol",
          }),
          publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "decimals",
          }),
        ]);
        sym = fetchedSym as string;
        dec = fetchedDec as number;
        setTokenSymbol(sym);
        setDecimals(dec);
      } catch {
        setFormError("トークン情報の取得に失敗しました");
        setLoadingToken(false);
        return;
      } finally {
        setLoadingToken(false);
      }
    }

    const value = parseUnits(amount, dec);
    const deadline = Math.floor(Date.now() / 1000) + deadlineMinutes * 60;

    // リレーセッション作成を試みる (失敗してもQRフォールバックで継続)
    const session = await createSession(deadline);
    if (session) setRelaySession(session);

    const data: QRaData = {
      type: "permit-request",
      chainId: selectedChainId,
      token: tokenAddress as `0x${string}`,
      receiver: address,
      value: value.toString(),
      decimals: dec,
      deadline,
      ...(session && RELAY_URL ? { sessionId: session.sessionId, relayUrl: RELAY_URL } : {}),
    };

    setQrAData(data);
    setStep("R-2");
  }, [address, tokenAddress, amount, decimals, deadlineMinutes, selectedChainId, tokenSymbol, publicClient]);

  // R-2b: QR_B スキャン
  const handleQRBScan = useCallback(
    (text: string) => {
      setFormError(null);
      let data: QRbData;
      try {
        if (text.includes("#")) {
          const fragment = text.split("#")[1];
          data = decodeFragment<QRbData>(fragment);
        } else {
          data = JSON.parse(text) as QRbData;
        }
        if (data.type !== "permit-signature") throw new Error("invalid QR type");
      } catch {
        setFormError("QRコードの形式が正しくありません");
        return;
      }
      setQrBData(data);
      setSelectedChainId(data.chainId);
      setDecimals(JPYC_DECIMALS);
      setStep("R-3");
    },
    []
  );

  // R-3: gas fee 見積もり（qrBData と chainConfig が揃ったら実行）
  useEffect(() => {
    if (!qrBData || !chainConfig || !publicClient || !address) return;

    const estimate = async () => {
      try {
        const [gasUnits, fees] = await Promise.all([
          publicClient.estimateContractGas({
            address: chainConfig.permitPaymentAddress,
            abi: PERMIT_PAYMENT_ABI,
            functionName: "permitAndTransfer",
            args: [
              qrBData.token,
              qrBData.owner,
              qrBData.receiver,
              BigInt(qrBData.value),
              BigInt(qrBData.deadline),
              qrBData.v,
              qrBData.r,
              qrBData.s,
            ],
            account: address,
          }),
          publicClient.estimateFeesPerGas(),
        ]);
        const feeWei = gasUnits * (fees.maxFeePerGas ?? fees.gasPrice ?? 0n);
        const feeFormatted = formatUnits(feeWei, NATIVE_DECIMALS);
        const nativeSymbol = NATIVE_SYMBOL[selectedChainId] ?? "ETH";
        setEstimatedGas(`${Number(feeFormatted).toFixed(6)} ${nativeSymbol}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setEstimatedGas(`見積もり失敗: ${msg.slice(0, 200)}`);
      }
    };

    estimate();
  }, [qrBData, chainConfig, publicClient, address, selectedChainId]);

  // R-3: permitAndTransfer 送信
  const handleSubmit = useCallback(() => {
    if (!qrBData || !chainConfig) return;

    writeContract({
      address: chainConfig.permitPaymentAddress,
      abi: PERMIT_PAYMENT_ABI,
      functionName: "permitAndTransfer",
      args: [
        qrBData.token,
        qrBData.owner,
        qrBData.receiver,
        BigInt(qrBData.value),
        BigInt(qrBData.deadline),
        qrBData.v,
        qrBData.r,
        qrBData.s,
      ],
      chainId: qrBData.chainId,
    });
  }, [qrBData, chainConfig, writeContract]);

  const formattedAmount =
    qrAData || qrBData
      ? formatUnits(BigInt((qrAData ?? qrBData)!.value), decimals)
      : "";

  const showAllowlistWarning =
    qrAData && BigInt(qrAData.value) > JPYC_ALLOWLIST_THRESHOLD;

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => navigate("/")}>
          &#8592;
        </button>
        <h2 style={styles.title}>
          受取人フロー
          {step === "R-1" && " - リクエスト作成"}
          {step === "R-2" && " - QR提示"}
          {step === "R-2b" && " - 署名QRスキャン"}
          {step === "R-3" && " - 送信確認"}
          {step === "R-4" && " - 完了"}
        </h2>
      </div>

      {!isConnected && (
        <div style={styles.card}>
          <p style={{ margin: "0 0 12px" }}>ウォレットを接続してください</p>
          <ConnectButton />
        </div>
      )}

      {/* R-1: リクエスト作成フォーム */}
      {step === "R-1" && (
        <div style={styles.card}>
          <div style={styles.formGroup}>
            <label style={styles.label}>チェーン</label>
            <select
              style={styles.select}
              value={selectedChainId}
              onChange={(e) => setSelectedChainId(Number(e.target.value))}
            >
              {Object.entries(CHAIN_CONFIGS).map(([id, cfg]) => (
                <option key={id} value={id}>
                  {cfg.chain.name} (chainId: {id})
                </option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>トークン</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* JPYC 選択肢 */}
              <label style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                border: `2px solid ${tokenMode === "jpyc" ? "#0d6efd" : "#ced4da"}`,
                borderRadius: 8,
                cursor: "pointer",
                background: tokenMode === "jpyc" ? "#f0f6ff" : "white",
              }}>
                <input
                  type="radio"
                  name="tokenMode"
                  value="jpyc"
                  checked={tokenMode === "jpyc"}
                  onChange={() => setTokenMode("jpyc")}
                  style={{ accentColor: "#0d6efd", width: 16, height: 16 }}
                />
                <span style={{ fontSize: 14, fontWeight: tokenMode === "jpyc" ? 600 : 400 }}>
                  JPYC
                </span>
              </label>

              {/* 手動入力選択肢 */}
              <label style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                border: `2px solid ${tokenMode === "manual" ? "#0d6efd" : "#ced4da"}`,
                borderRadius: 8,
                cursor: "pointer",
                background: tokenMode === "manual" ? "#f0f6ff" : "white",
              }}>
                <input
                  type="radio"
                  name="tokenMode"
                  value="manual"
                  checked={tokenMode === "manual"}
                  onChange={() => {
                    setTokenMode("manual");
                    setTokenAddress("");
                    setTokenSymbol("");
                  }}
                  style={{ accentColor: "#0d6efd", width: 16, height: 16 }}
                />
                <span style={{ fontSize: 14, fontWeight: tokenMode === "manual" ? 600 : 400 }}>
                  手動で入力
                </span>
              </label>

              {/* 手動入力時のみテキストボックスを表示 */}
              {tokenMode === "manual" && (
                <input
                  style={styles.input}
                  type="text"
                  placeholder="0x..."
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                  autoFocus
                />
              )}
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>金額 ({tokenSymbol || "トークン単位"})</label>
            <input
              style={styles.input}
              type="number"
              min="0"
              placeholder="例: 1000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>有効期限 (分)</label>
            <input
              style={styles.input}
              type="number"
              min="1"
              max="60"
              value={deadlineMinutes}
              onChange={(e) => setDeadlineMinutes(Number(e.target.value))}
            />
          </div>

          {showAllowlistWarning && (
            <div style={styles.warning}>
              100,000 JPYC を超える送金はallowlist登録が必要です。
            </div>
          )}

          {formError && <p style={styles.errorText}>{formError}</p>}

          <button
            style={styles.button}
            onClick={handleCreateRequest}
            disabled={!isConnected || loadingToken}
          >
            {loadingToken ? "トークン情報取得中..." : "QRコードを生成"}
          </button>
        </div>
      )}

      {/* R-2: QR_A 表示（送金者がスキャンするとアプリが開く） */}
      {step === "R-2" && qrAData && (() => {
        const permalinkData: PermalinkData = {
          type: qrAData.type,
          chainId: qrAData.chainId,
          token: qrAData.token,
          receiver: qrAData.receiver,
          value: qrAData.value,
          decimals: qrAData.decimals,
        };
        const permalink = receiverRequestUrl(permalinkData);
        return (
          <>
            {/* グラデーションカード */}
            <div style={{
              background: "linear-gradient(150deg, #0a1628 0%, #0d47a1 55%, #29b6f6 100%)",
              borderRadius: 20,
              padding: "28px 24px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              boxShadow: "0 6px 24px rgba(13, 71, 161, 0.35)",
            }}>
              {/* タイトル */}
              <p style={{ color: "white", fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "0.02em" }}>
                {tokenSymbol ? `${tokenSymbol}で受け取る` : "受け取る"}
              </p>

              {/* QRコード (白背景は QRDisplay 内部が保持) */}
              <QRDisplay value={senderUrl(qrAData)} />

              {/* 案内テキスト */}
              <p style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, margin: 0, textAlign: "center" }}>
                送金者にスキャンしてもらってください
              </p>

              {/* カウントダウン */}
              <p style={{
                color: "rgba(255,255,255,0.55)",
                fontSize: 12,
                margin: 0,
                fontFamily: "monospace",
                letterSpacing: "0.08em",
              }}>
                {countdown}
              </p>
            </div>

            <div style={styles.card}>
              {relaySession ? (
                <p style={styles.hint}>
                  送金者がスキャンして署名すると、自動的に次の画面へ進みます。
                  <br />
                  <span style={{ color: "#198754", fontWeight: 600 }}>リレー接続中</span>
                  {" — "}手動でスキャンしたい場合は下のボタンを使ってください。
                </p>
              ) : (
                <p style={styles.hint}>
                  送金者がスキャンするとアプリが開き、署名画面に進みます。
                  <br />
                  署名完了後、送金者の画面に表示されたQRコードをスキャンしてください。
                </p>
              )}
            </div>
            <div style={styles.card}>
              <p style={{ ...styles.label, marginBottom: 8 }}>パーマリンク (同条件で繰り返し利用)</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  style={{ ...styles.input, flex: 1, minWidth: 0, fontSize: 12 }}
                  type="text"
                  readOnly
                  value={permalink}
                />
                <button
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    border: "1px solid #ced4da",
                    borderRadius: 8,
                    background: "#f8f9fa",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  onClick={() => navigator.clipboard.writeText(permalink)}
                >
                  コピー
                </button>
              </div>
            </div>
            <button
              style={styles.button}
              onClick={() => setStep("R-2b")}
            >
              署名QRをスキャンする
            </button>
          </>
        );
      })()}

      {/* R-2b: QR_B スキャン（送金者の署名QRを読み取る） */}
      {step === "R-2b" && (
        <>
          <QRScanner onResult={handleQRBScan} onError={(e) => setFormError(e.message)} />
          {formError && <p style={styles.errorText}>{formError}</p>}
          <button
            style={{ ...styles.button, background: "#6c757d" }}
            onClick={() => setStep("R-2")}
          >
            戻る
          </button>
        </>
      )}

      {/* R-3: 送信確認（QR_B URLから直接開かれる） */}
      {step === "R-3" && qrBData && (
        <>
          <div style={styles.card}>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>送金者</span>
              <span style={styles.infoValue}>{qrBData.owner}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>金額</span>
              <span style={styles.infoValue}>
                {formattedAmount} {tokenSymbol}
              </span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>有効期限</span>
              <span style={styles.infoValue}>
                {new Date(qrBData.deadline * 1000).toLocaleString("ja-JP")}
              </span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>推定ガス代</span>
              <span style={styles.infoValue}>
                {estimatedGas ?? "見積もり中..."}
              </span>
            </div>
          </div>

          {writeError && <p style={styles.errorText}>{writeError.message}</p>}
          {formError && <p style={styles.errorText}>{formError}</p>}

          <button
            style={styles.button}
            onClick={handleSubmit}
            disabled={isPending || isTxPending || !isConnected}
          >
            {isPending || isTxPending ? "送信中..." : "送信する (ガス代を支払う)"}
          </button>
        </>
      )}

      {/* R-4: 完了 */}
      {step === "R-4" && txHash && (() => {
        const chainConfig = connectedChainId ? getChainConfig(connectedChainId) : undefined;
        const explorerUrl = chainConfig ? `${chainConfig.explorerTxUrl}${txHash}` : undefined;
        return (
          <div style={styles.successCard}>
            <p style={{ fontWeight: 700, fontSize: 18, margin: "0 0 12px" }}>
              送金完了
            </p>
            <p style={{ margin: "0 0 8px", fontSize: 14 }}>トランザクションハッシュ:</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p style={{ ...styles.txHash, margin: 0, flex: 1, minWidth: 0 }}>{txHash}</p>
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
                onClick={() => navigator.clipboard.writeText(txHash)}
              >
                コピー
              </button>
            </div>
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  fontSize: 14,
                  color: "#1a73e8",
                  textDecoration: "underline",
                }}
              >
                エクスプローラーで確認する
              </a>
            )}
          </div>
        );
      })()}
    </div>
  );
}
