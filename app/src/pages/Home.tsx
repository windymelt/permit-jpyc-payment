import { useNavigate } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
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
} as const;

export default function Home() {
  const navigate = useNavigate();

  return (
    <div style={styles.root}>
      <h1 style={styles.title}>Permit Payment</h1>
      <p style={styles.subtitle}>
        ERC-2612 を使ったガスレス送金 dApp
        <br />
        あなたの役割を選んでください
      </p>

      <div style={styles.buttonRow}>
        <button
          style={{ ...styles.roleButton, ...styles.receiverButton }}
          onClick={() => navigate("/receiver")}
        >
          受け手
          <br />
          <span style={{ fontSize: 13, fontWeight: 400 }}>QRを提示する側</span>
        </button>
        <button
          style={{ ...styles.roleButton, ...styles.senderButton }}
          onClick={() => navigate("/sender")}
        >
          送り手
          <br />
          <span style={{ fontSize: 13, fontWeight: 400 }}>QRをスキャンする側</span>
        </button>
      </div>

      <ConnectButton />
    </div>
  );
}
