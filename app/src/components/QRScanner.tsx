import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";

interface Props {
  onResult: (text: string) => void;
  onError?: (err: Error) => void;
}

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 12,
  },
  video: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 12,
    border: "2px solid #dee2e6",
  },
  hint: {
    fontSize: 13,
    color: "#6c757d",
    margin: 0,
  },
  error: {
    color: "#dc3545",
    fontSize: 14,
  },
} as const;

/// カメラでQRコードをスキャンするコンポーネント。
/// @zxing/browser の BrowserQRCodeReader を使用する。
export default function QRScanner({ onResult, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    readerRef.current = reader;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, err, controls) => {
        controlsRef.current = controls;
        if (result) {
          controls.stop();
          onResult(result.getText());
        }
        if (err && !(err.message?.includes("No MultiFormat"))) {
          const e = err instanceof Error ? err : new Error(String(err));
          setError(e.message);
          onError?.(e);
        }
      })
      .catch((e: Error) => {
        setError(e.message);
        onError?.(e);
      });

    return () => {
      controlsRef.current?.stop();
    };
  }, [onResult, onError]);

  return (
    <div style={styles.root}>
      <video ref={videoRef} style={styles.video} autoPlay muted playsInline />
      <p style={styles.hint}>カメラにQRコードをかざしてください</p>
      {error && <p style={styles.error}>カメラエラー: {error}</p>}
    </div>
  );
}
