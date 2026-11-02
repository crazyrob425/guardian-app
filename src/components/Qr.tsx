import { useEffect, useRef } from "react";
import QRCode from "qrcode";

/** QR code for a payment/checkout link (Phase 4) — rendered locally, offline-safe. */
export default function Qr(props: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || !props.value) return;
    QRCode.toCanvas(ref.current, props.value, {
      width: props.size ?? 192,
      margin: 2,
      color: { dark: "#0a0a0f", light: "#ffffff" },
    }).catch(() => {});
  }, [props.value, props.size]);
  return (
    <canvas
      ref={ref}
      className="mx-auto rounded-xl bg-white p-1"
      style={{ width: props.size ?? 192, height: props.size ?? 192 }}
      aria-label="Payment QR code"
    />
  );
}
