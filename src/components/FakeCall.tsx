import { useEffect, useRef, useState } from "react";
import { buzz } from "../lib/audio";

/**
 * Full-screen fake incoming call. Rings (looped ringtone + vibration) until
 * answered; on answer, plays the scripted rescue voice and shows a live
 * call timer. Looks like a normal phone call — that's the point.
 */
export default function FakeCall(props: { callerName: string; onDone: () => void }) {
  const [phase, setPhase] = useState<"ringing" | "talking">("ringing");
  const [secs, setSecs] = useState(0);
  const ringRef = useRef<HTMLAudioElement | null>(null);
  const voiceRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const ring = new Audio("/sounds/ringtone.mp3");
    ring.loop = true;
    ringRef.current = ring;
    ring.play().catch(() => {});
    buzz([400, 300, 400]);
    const vib = window.setInterval(() => buzz([300]), 3000);
    return () => {
      window.clearInterval(vib);
      ring.pause();
      voiceRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (phase !== "talking") return;
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  const answer = () => {
    ringRef.current?.pause();
    setPhase("talking");
    const v = new Audio("/sounds/fake-call-voice.mp3");
    voiceRef.current = v;
    v.play().catch(() => {});
  };

  const end = () => {
    ringRef.current?.pause();
    voiceRef.current?.pause();
    props.onDone();
  };

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-between bg-gradient-to-b from-zinc-800 to-zinc-950 px-6 py-14 text-center">
      <div>
        <p className="mb-1 text-sm text-zinc-400">{phase === "ringing" ? "Incoming call" : `${mm}:${ss}`}</p>
        <p className="text-3xl font-semibold text-white">{props.callerName}</p>
        <p className="mt-1 text-sm text-zinc-500">mobile</p>
      </div>
      <div className={`flex h-28 w-28 items-center justify-center rounded-full bg-zinc-700 text-4xl ${phase === "ringing" ? "animate-pulse" : ""}`}>
        👤
      </div>
      {phase === "ringing" ? (
        <div className="flex w-full max-w-xs items-center justify-between">
          <button onClick={end} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-2xl shadow-lg" aria-label="Decline">📵</button>
          <button onClick={answer} className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-2xl shadow-lg animate-bounce" aria-label="Answer">📞</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="max-w-xs text-sm text-zinc-400">Play along out loud — then leave. Your circle can see your live session as usual.</p>
          <button onClick={end} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-2xl shadow-lg" aria-label="End call">📵</button>
        </div>
      )}
    </div>
  );
}
