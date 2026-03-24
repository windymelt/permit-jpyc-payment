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
  },
} as const;

export default function App() {
  return (
    <BrowserRouter>
      <div style={styles.container}>
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
    </BrowserRouter>
  );
}
