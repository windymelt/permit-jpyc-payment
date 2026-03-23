import { QRCodeSVG } from "qrcode.react";

interface Props {
  value: string;
  label?: string;
  size?: number;
}

const DEBUG = import.meta.env.DEV;

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 12,
    padding: 24,
    background: "white",
    borderRadius: 16,
    boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
  },
  label: {
    fontSize: 14,
    color: "#6c757d",
    margin: 0,
  },
  debugLink: {
    fontSize: 11,
    color: "#6c757d",
    wordBreak: "break-all" as const,
    textAlign: "center" as const,
    maxWidth: 280,
  },
} as const;

/// QRコードを表示するコンポーネント。
/// QR_B は署名データを含むため約500バイトになる可能性がある。
/// エラー訂正レベルは L (Low) を使用してデータ容量を確保する。
export default function QRDisplay({ value, label, size = 280 }: Props) {
  const isUrl = value.startsWith("http");

  return (
    <div style={styles.root}>
      {label && <p style={styles.label}>{label}</p>}
      <QRCodeSVG
        value={value}
        size={size}
        level="L"
        includeMargin={true}
      />
      {DEBUG && (
        isUrl
          ? <a href={value} style={styles.debugLink}>{value}</a>
          : <span style={styles.debugLink}>{value}</span>
      )}
    </div>
  );
}
