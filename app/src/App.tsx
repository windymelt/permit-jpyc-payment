import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ReceiverFlow from "./pages/ReceiverFlow";
import SenderFlow from "./pages/SenderFlow";

const styles = {
  container: {
    maxWidth: 480,
    margin: "0 auto",
    padding: "0 16px",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
  },
  main: {
    flex: 1,
  },
  footer: {
    marginTop: 32,
    paddingBottom: 24,
    borderTop: "1px solid #e9ecef",
    paddingTop: 16,
  },
  footerText: {
    fontSize: 10,
    color: "#adb5bd",
    lineHeight: 1.7,
    margin: 0,
  },
} as const;

export default function App() {
  return (
    <BrowserRouter>
      <div style={styles.container}>
        <div style={styles.main}>
          <Routes>
            <Route path="/" element={<Home />} />
            {/* /receiver - R-1 リクエスト作成 */}
            <Route path="/receiver" element={<ReceiverFlow />} />
            {/* /receiver/request - パーマリンクからQR_A直接表示 */}
            <Route path="/receiver/request" element={<ReceiverFlow initialStep="R-2" />} />
            {/* /receiver/scan - QR_B スキャン画面 */}
            <Route path="/receiver/scan" element={<ReceiverFlow initialStep="R-2b" />} />
            {/* /receiver/confirm#<base64(QR_B)> - QR_B スキャン後の確認・送信画面 */}
            <Route path="/receiver/confirm" element={<ReceiverFlow initialStep="R-3" />} />
            {/* /sender#<base64(QR_A)> - QR_A スキャン後の確認・署名画面 */}
            <Route path="/sender" element={<SenderFlow />} />
          </Routes>
        </div>
        <footer style={styles.footer}>
          <p style={styles.footerText}>
            ※ 本サービス（コンテンツ・作品等）はJPYC株式会社による公式コンテンツではありません。<br />
            ※ 「JPYC」はJPYC株式会社の提供するステーブルコインです。<br />
            ※ JPYC及びJPYCロゴは、JPYC株式会社の登録商標です。
          </p>
          <a
            href="https://github.com/windymelt/permit-jpyc-payment"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 10, color: "#adb5bd" }}
          >
            github.com/windymelt/permit-jpyc-payment
          </a>
        </footer>
      </div>
    </BrowserRouter>
  );
}
