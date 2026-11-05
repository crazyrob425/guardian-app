import { useEffect, useRef, useState } from "react";
import { buzz } from "../lib/audio";
import { getPersona } from "../lib/personas";
import { LiveCall, REPLY_CHIPS, type LiveCallEvent } from "../lib/livecall";
import { warmPersonaVoice } from "../lib/tts";

export type FakeCallTheme = "auto" | "ios" | "samsung" | "pixel" | "classic";
export type ResolvedTheme = Exclude<FakeCallTheme, "auto">;

export function resolveTheme(theme: FakeCallTheme): ResolvedTheme {
  if (theme !== "auto") return theme;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/SM-[A-Z0-9]|Galaxy|SamsungBrowser/i.test(ua)) return "samsung";
  if (/Pixel|Android/i.test(ua)) return "pixel";
  return "classic";
}

const THEME_BG: Record<ResolvedTheme, string> = {
  ios: "bg-gradient-to-b from-[#3a3f4a] via-[#23252d] to-[#101116]",
  samsung: "bg-gradient-to-b from-[#0d2b2e] via-[#0a1f24] to-[#060d10]",
  pixel: "bg-gradient-to-b from-[#1b1e26] via-[#14161d] to-[#0b0c10]",
  classic: "bg-gradient-to-b from-zinc-800 to-zinc-950",
};

/**
 * Full-screen fake incoming call (v0.10): skinned to look like the call
 * screen of her actual phone (iPhone / Samsung One UI / Pixel / classic),
 * and — in live mode — the caller actually TALKS with her: a neural
 * voice from Guardian's own TTS service (device speech synthesis only
 * as an offline fallback) plus speech recognition run a branching
 * persona script. Recorded-script mode remains for the classic Mom
 * recording.
 */
export default function FakeCall(props: {
  callerName: string;
  personaId: string;
  theme: FakeCallTheme;
  live: boolean;
  onDone: () => void;
}) {
  const persona = getPersona(props.personaId);
  const theme = resolveTheme(props.theme);
  const [phase, setPhase] = useState<"ringing" | "talking">("ringing");
  const [secs, setSecs] = useState(0);
  const [line, setLine] = useState("");
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [mode, setMode] = useState<"voice" | "chips">("chips");
  const ringRef = useRef<HTMLAudioElement | null>(null);
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<LiveCall | null>(null);

  useEffect(() => {
    // While it rings, pre-render the caller's neural voice (opening
    // lines first) so she sounds human the second the call is answered.
    if (props.live) warmPersonaVoice(persona);
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
      callRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (phase !== "talking") return;
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  const onEvent = (e: LiveCallEvent) => {
    if (e.type === "line") setLine(e.text);
    else if (e.type === "listening") setListening(e.on);
    else if (e.type === "heard") setHeard(e.text);
    else if (e.type === "mode") setMode(e.mode);
  };

  const answer = () => {
    ringRef.current?.pause();
    setPhase("talking");
    if (!props.live && persona.id === "mom") {
      const v = new Audio("/sounds/fake-call-voice.mp3");
      voiceRef.current = v;
      v.play().catch(() => {});
      setLine("(recorded rescue script)");
      return;
    }
    const call = new LiveCall(persona, onEvent);
    callRef.current = call;
    call.start(!props.live);
  };

  const end = () => {
    ringRef.current?.pause();
    voiceRef.current?.pause();
    callRef.current?.stop();
    props.onDone();
  };

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const initial = (props.callerName || persona.name).charAt(0).toUpperCase();

  return (
    <div className={`fixed inset-0 z-[90] flex flex-col items-center justify-between px-6 py-14 text-center ${THEME_BG[theme]}`}>
      <div>
        <p className="mb-1 text-sm text-zinc-300/80">
          {phase === "ringing"
            ? theme === "ios" ? "mobile" : theme === "samsung" ? "Phone • Incoming call" : theme === "pixel" ? "Incoming call" : "Incoming call"
            : `${mm}:${ss}`}
        </p>
        <p className={`font-semibold text-white ${theme === "ios" ? "text-4xl font-light" : "text-3xl"}`}>{props.callerName || persona.name}</p>
        <p className="mt-1 text-sm text-zinc-400">{phase === "ringing" ? (theme === "ios" ? "" : "Mobile") : persona.relation}</p>
      </div>

      <div className={`flex items-center justify-center rounded-full text-5xl ${theme === "pixel" ? "bg-[#7da7d9] text-white" : "bg-zinc-700/80"} ${phase === "ringing" ? "animate-pulse" : ""} h-28 w-28`}>
        {theme === "pixel" ? <span className="text-4xl font-medium">{initial}</span> : persona.avatar}
      </div>

      {phase === "talking" && (
        <div className="w-full max-w-sm space-y-3">
          {line && <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm leading-relaxed text-zinc-100">“{line}”</p>}
          {listening && <p className="animate-pulse text-xs font-semibold text-emerald-300">🎙 Listening — talk back…</p>}
          {heard && <p className="text-xs text-zinc-500">You: “{heard}”</p>}
          {props.live && (
            <div className="flex flex-wrap justify-center gap-2">
              {REPLY_CHIPS.map((c) => (
                <button key={c} onClick={() => callRef.current?.respond(c)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-zinc-200 ring-1 ring-white/15">
                  {c}
                </button>
              ))}
            </div>
          )}
          {mode === "chips" && props.live && <p className="text-[11px] text-zinc-600">Tap a reply — she'll answer like it's real.</p>}
        </div>
      )}

      {phase === "ringing" ? (
        <div className="w-full max-w-xs">
          {theme === "ios" && (
            <div className="mb-10 flex items-center justify-between px-6 text-xs text-zinc-300">
              <span>⏰ Remind Me</span><span>💬 Message</span>
            </div>
          )}
          {theme === "samsung" && (
            <div className="mb-10 flex items-center justify-center gap-10 text-xs text-zinc-300">
              <span>💬 Message</span><span>⏰ Remind me</span><span>🚫 Block</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-center gap-1">
              <button onClick={end} className={`flex items-center justify-center rounded-full bg-[#e53935] text-2xl shadow-lg ${theme === "pixel" ? "h-14 w-20 rounded-full" : "h-16 w-16"}`} aria-label="Decline">📵</button>
              <span className="text-xs text-zinc-300">Decline</span>
            </div>
            {theme === "pixel" && <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-zinc-300">💬 Send a message</span>}
            <div className="flex flex-col items-center gap-1">
              <button onClick={answer} className={`flex animate-bounce items-center justify-center rounded-full bg-[#43a047] text-2xl shadow-lg ${theme === "pixel" ? "h-14 w-20 rounded-full" : "h-16 w-16"}`} aria-label="Answer">📞</button>
              <span className="text-xs text-zinc-300">{theme === "ios" ? "Accept" : "Answer"}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="max-w-xs text-xs text-zinc-500">Play along out loud — then leave. Your circle can see your live session as usual.</p>
          <button onClick={end} className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e53935] text-2xl shadow-lg" aria-label="End call">📵</button>
        </div>
      )}
    </div>
  );
}
