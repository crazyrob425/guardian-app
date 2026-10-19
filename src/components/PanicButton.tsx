import { useRef, useState, useEffect } from "react";
import { buzz } from "../lib/audio";

/**
 * Panic button: press-and-hold ~0.9s with a filling ring to prevent accidents,
 * still fast enough in a real emergency.
 */
export default function PanicButton(props: {
  label: string;
  onTrigger: () => void;
  size?: number;
  armed?: boolean;
}) {
  const size = props.size ?? 208;
  const HOLD_MS = 900;
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  const startT = useRef(0);
  const fired = useRef(false);

  const cancel = () => {
    cancelAnimationFrame(raf.current);
    setProgress(0);
    fired.current = false;
  };

  const tick = () => {
    const p = Math.min(1, (Date.now() - startT.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1 && !fired.current) {
      fired.current = true;
      buzz([300, 100, 300]);
      props.onTrigger();
      cancel();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startT.current = Date.now();
    fired.current = false;
    buzz(50);
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => cancel, []);

  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        className="relative touch-none select-none rounded-full outline-none"
        style={{ width: size, height: size }}
        aria-label={props.label}
      >
        <svg width={size} height={size} className="absolute inset-0 -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={props.armed === false ? "#52525b" : "#ef4444"}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)}
          />
        </svg>
        <span
          className={`absolute rounded-full font-black uppercase tracking-widest text-white flex items-center justify-center text-center leading-tight ${props.armed === false ? "bg-zinc-700" : "bg-red-600"}`}
          style={{ inset: 18, fontSize: size * 0.11 }}
        >
          {props.label}
        </span>
      </button>
      <p className="text-xs text-zinc-500">Press and hold to trigger</p>
    </div>
  );
}
