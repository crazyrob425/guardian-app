// Live AI fake call engine (v0.10) — 100% free, 100% on-device.
// The "AI caller" is the phone's own speech stack:
//   - speechSynthesis speaks the persona's lines (voice picked per persona),
//   - SpeechRecognition (where the browser offers it) listens to the user,
//   - the persona's branching script routes replies by intent.
// No server, no API key, no per-minute cost. Where recognition is missing
// or the mic is denied, the engine degrades to tap-to-reply chips — the
// conversation still advances and still sounds like a real call.

import { classifyIntent, type Persona } from "./personas";

interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
}

function getSR(): (new () => SR) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition as new () => SR) || (w.webkitSpeechRecognition as new () => SR) || null;
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
export function recognitionSupported(): boolean {
  return getSR() !== null;
}

function pickVoice(persona: Persona): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
    for (const hint of persona.voice.hints) {
      const hit = voices.find((v) => v.name.toLowerCase().includes(hint));
      if (hit) return hit;
    }
    return voices[0] ?? null;
  } catch {
    return null;
  }
}

export type LiveCallEvent =
  | { type: "line"; text: string }
  | { type: "listening"; on: boolean }
  | { type: "heard"; text: string }
  | { type: "mode"; mode: "voice" | "chips" }
  | { type: "ended" };

export class LiveCall {
  private persona: Persona;
  private emit: (e: LiveCallEvent) => void;
  private rec: SR | null = null;
  private turns = 0;
  private stopped = false;
  private promptTimer: number | null = null;
  private mode: "voice" | "chips" = "chips";
  private heardDistress = false;
  private scripted = false;

  constructor(persona: Persona, emit: (e: LiveCallEvent) => void) {
    this.persona = persona;
    this.emit = emit;
  }

  start(scripted = false) {
    this.scripted = scripted;
    this.mode = recognitionSupported() && !scripted ? "voice" : "chips";
    this.emit({ type: "mode", mode: this.mode });
    // Voices may load async; warm the list.
    try { window.speechSynthesis.getVoices(); } catch { /* noop */ }
    this.speakLines(this.persona.opening, () => this.listen());
  }

  stop() {
    this.stopped = true;
    this.clearPrompt();
    try { this.rec?.stop(); } catch { /* noop */ }
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  }

  /** The user replied (via mic transcript or a tapped chip). */
  respond(text: string) {
    if (this.stopped) return;
    this.emit({ type: "heard", text });
    try { this.rec?.stop(); } catch { /* noop */ }
    const intent = classifyIntent(text);
    if (intent === "distress") this.heardDistress = true;
    this.turns++;
    if (intent === "goodbye" || this.turns >= 5) {
      this.speakLines([pick(this.persona.replies.goodbye), this.persona.closing], () => this.ambient());
      return;
    }
    const line = pick(this.persona.replies[intent]);
    this.speakLines([line], () => this.listen());
  }

  private ambient() {
    // Call stays "live" quietly; persona checks in every ~30 s if it drags.
    this.clearPrompt();
    this.promptTimer = window.setTimeout(() => {
      if (this.stopped) return;
      this.speakLines([pick(this.persona.prompts)], () => this.ambient());
    }, 30000);
  }

  private listen() {
    if (this.stopped || this.scripted) return;
    if (this.mode !== "voice") return; // chips mode: wait for a tap
    const Ctor = getSR();
    if (!Ctor) { this.mode = "chips"; this.emit({ type: "mode", mode: "chips" }); return; }
    try {
      const rec = new Ctor();
      this.rec = rec;
      rec.lang = "en-US";
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (e) => {
        const text = e.results[0]?.[0]?.transcript ?? "";
        if (text.trim()) this.respond(text);
        else this.listen();
      };
      rec.onerror = () => {
        // Mic denied / no speech: fall back to chips permanently (denied)
        // or nudge once and listen again (silence).
        this.emit({ type: "listening", on: false });
        this.mode = "chips";
        this.emit({ type: "mode", mode: "chips" });
      };
      rec.onend = () => this.emit({ type: "listening", on: false });
      this.emit({ type: "listening", on: true });
      rec.start();
    } catch {
      this.mode = "chips";
      this.emit({ type: "mode", mode: "chips" });
    }
  }

  private speakLines(lines: string[], then?: () => void) {
    if (this.stopped) return;
    const [head, ...rest] = lines;
    if (!head) { then?.(); return; }
    this.emit({ type: "line", text: head });
    if (!speechSupported()) {
      // No TTS at all: pace the lines like speech so she can still act.
      window.setTimeout(() => this.speakLines(rest, then), 2600);
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(head);
      const v = pickVoice(this.persona);
      if (v) u.voice = v;
      u.pitch = this.persona.voice.pitch;
      u.rate = this.persona.voice.rate;
      u.onend = () => this.speakLines(rest, then);
      u.onerror = () => this.speakLines(rest, then);
      window.speechSynthesis.speak(u);
    } catch {
      window.setTimeout(() => this.speakLines(rest, then), 2600);
    }
  }

  private clearPrompt() {
    if (this.promptTimer) window.clearTimeout(this.promptTimer);
    this.promptTimer = null;
  }

  get distressHeard() { return this.heardDistress; }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const REPLY_CHIPS = [
  "Okay, I'm coming right now",
  "Give me five minutes",
  "What happened? Where are you?",
  "I have to go — bye",
];
