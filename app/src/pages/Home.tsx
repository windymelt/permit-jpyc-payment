import { useNavigate } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "80vh",
    gap: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    color: "#6c757d",
    margin: 0,
    textAlign: "center" as const,
  },
  buttonRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  roleButton: {
    padding: "20px 32px",
    fontSize: 18,
    fontWeight: 600,
    borderRadius: 12,
    border: "2px solid",
    cursor: "pointer",
    background: "white",
    minWidth: 160,
  },
  receiverButton: {
    borderColor: "#0d6efd",
    color: "#0d6efd",
  },
  senderButton: {
    borderColor: "#198754",
    color: "#198754",
  },
  howItWorks: {
    maxWidth: 480,
    padding: "20px 24px",
    background: "#f8f9fa",
    borderRadius: 12,
    border: "1px solid #e9ecef",
    textAlign: "left" as const,
  },
  howItWorksTitle: {
    fontSize: 15,
    fontWeight: 700,
    margin: "0 0 8px",
  },
  howItWorksBody: {
    fontSize: 13,
    lineHeight: 1.7,
    color: "#495057",
    margin: 0,
  },
} as const;

export default function Home() {
  const navigate = useNavigate();

  return (
    <div style={styles.root}>
      <h1 style={styles.title}>JPYC™ペイ</h1>
      <p style={styles.subtitle}>
        登録不要・手数料不要でJPYC™を送金できます
        <br />
        あなたの役割を選んでください
        <br />
        もらう側が準備したQRコードを、おくる側が読み取ります
      </p>

      <div style={styles.buttonRow}>
        <button
          style={{ ...styles.roleButton, ...styles.receiverButton }}
          onClick={() => navigate("/receiver")}
        >
          もらう
          <br />
          <span style={{ fontSize: 13, fontWeight: 400 }}>QRを提示する側</span>
        </button>
        <button
          style={{ ...styles.roleButton, ...styles.senderButton }}
          onClick={() => navigate("/sender")}
        >
          おくる
          <br />
          <span style={{ fontSize: 13, fontWeight: 400 }}>QRを読み取る側</span>
        </button>
      </div>

      <ConnectButton />

      <div style={{ fontSize: 13, color: "#6c757d" }}>
          対応ウォレット: MetaMask (送金)
          <br/>
          ERC-2612 に対応するすべてのウォレットで着金できます
      </div>

      <div style={styles.howItWorks}>
        <p style={styles.howItWorksTitle}>仕組み</p>
        <p style={styles.howItWorksBody}>
          ERC-2612 (Permit) という標準規格を利用しています。
          送金者はトークンの送金依頼に署名するだけで、実際の送金トランザクションは受取人側が実行します。
          コントラクトが仲介することで、送金にかかるガス代を受取人が負担する「着払い」の送金が実現できます。
          ちょうど、小切手に署名してもらい、自分でお金を受け取りに行くのと同じです。
        </p>
      </div>
    </div>
  );
}
