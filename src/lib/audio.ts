// Alarm sounds: 5 built-in files + the user's own file (IndexedDB).
// The selected alarm (Settings) is what panic / missed check-out / SOS
// play, looping until stood down. If file playback fails for any reason,
// we fall back to the synthesized Web Audio siren so an alarm ALWAYS
// sounds. Chimes + vibration helpers live at the bottom.

import { store, type AlarmSoundId } from "./store";
import { loadCustomAlarm } from "./alarmdb";

export interface AlarmSoundDef {
  id: Exclude<AlarmSoundId, "custom">;
  name: string;
  desc: string;
  file: string;
}

export const ALARM_SOUNDS: AlarmSoundDef[] = [
  { id: "police", name: "Police Siren", desc: "Realistic wail-and-yelp patrol cycle. Instant authority.", file: "sounds/police.mp3" },
  { id: "piercing", name: "Piercing Shriek", desc: "Non-stop high-pitched personal-alarm scream. Impossible to talk over.", file: "sounds/piercing.mp3" },
  { id: "voice", name: "BNE Security Voice Warning", desc: "Security-system voice announcing live recording, tracking — and armed officers en route. Alternates: woman's voice, then a man's.", file: "sounds/voice-warning.mp3" },
  { id: "help", name: "Help — Being Attacked!", desc: "A desperate, high-pitched scream for help: attacked, assaulted, emergency. Unignorable by design.", file: "sounds/help-attack.mp3" },
  { id: "airraid", name: "Air Raid Siren", desc: "Slow civil-defense rise and fall. Deep, ominous, heard for blocks.", file: "sounds/airraid.mp3" },
  { id: "klaxon", name: "Security Klaxon", desc: "Classic two-tone building alarm — the dee-dah that means evacuate.", file: "sounds/klaxon.mp3" },
];

export function alarmFileUrl(id: Exclude<AlarmSoundId, "custom">): string {
  const def = ALARM_SOUNDS.find((d) => d.id === id) ?? ALARM_SOUNDS[0];
  return `${import.meta.env.BASE_URL}${def.file}`;
}

// ---- playback engine -------------------------------------------------------

let audioEl: HTMLAudioElement | null = null;
let audioUrl: string | null = null; // object URL to revoke (custom files)
let webFallbackStop: (() => void) | null = null;
let alarmOn = false;

// ---- panic PIN lock ---------------------------------------------------------
// Once a real panic fires (panic button, missed check-out, home SOS), the
// alarm locks: stopAlarm()/stopSiren() refuse until the lock is released
// by PinUnlock after the user enters the App PIN from Settings. If no App
// PIN is set, lockAlarm() is a no-op and the alarm stops normally.
let pinLock = false;

export function lockAlarm(): void {
  try {
    if (store.getSettings().pinHash) pinLock = true;
  } catch { /* noop */ }
}
export function isAlarmLocked(): boolean {
  return pinLock;
}
export function unlockAlarm(): void {
  pinLock = false;
}

function teardownFile() {
  if (audioEl) {
    try { audioEl.pause(); audioEl.removeAttribute("src"); audioEl.load(); } catch { /* noop */ }
    audioEl = null;
  }
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
}

export function isAlarmPlaying(): boolean {
  return alarmOn;
}

/** Start the selected alarm, looping. Never rejects — falls back to synth. */
export async function startAlarm(): Promise<void> {
  stopAlarm(true);
  alarmOn = true;
  const settings = store.getSettings();
  try {
    let src: string;
    if (settings.alarmSound === "custom") {
      const rec = await loadCustomAlarm();
      if (!rec) throw new Error("no custom file");
      audioUrl = URL.createObjectURL(rec.blob);
      src = audioUrl;
    } else {
      src = alarmFileUrl(settings.alarmSound);
    }
    const el = new Audio(src);
    el.loop = true;
    el.preload = "auto";
    audioEl = el;
    await el.play();
  } catch {
    // File blocked/missing (e.g. autoplay policy before first interaction,
    // or sound not cached offline) — synthesized siren always works.
    try { webFallbackStop = startWebSiren(); } catch { /* noop */ }
  }
}

/**
 * Stop the alarm. Returns false (and keeps sounding) when the panic PIN
 * lock is engaged and `force` isn't set — internal restarts and the
 * PinUnlock success path pass force. A refused stop means the caller
 * should show the PIN pad.
 */
export function stopAlarm(force = false): boolean {
  if (pinLock && !force) return false;
  alarmOn = false;
  teardownFile();
  if (webFallbackStop) { try { webFallbackStop(); } catch { /* noop */ } webFallbackStop = null; }
  stopSirenNodes();
  return true;
}

// Back-compat names used across the app (panic, SOS, test buttons).
export function startSiren(): () => void {
  void startAlarm();
  return () => { stopSiren(); };
}
export function stopSiren(): boolean {
  return stopAlarm();
}
export function isSirenOn(): boolean {
  return alarmOn;
}

// ---- synthesized fallback siren (original Web Audio siren) -----------------

let sirenNodes: { ctx: AudioContext; osc: OscillatorNode; gain: GainNode; timer: number } | null = null;

function startWebSiren(): () => void {
  stopSirenNodes();
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.value = 700;
  gain.gain.value = 0.0;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.4);
  let high = false;
  const timer = window.setInterval(() => {
    high = !high;
    osc.frequency.setTargetAtTime(high ? 1400 : 650, ctx.currentTime, 0.05);
  }, 450);
  sirenNodes = { ctx, osc, gain, timer };
  return stopSirenNodes;
}

function stopSirenNodes() {
  if (!sirenNodes) return;
  const { ctx, osc, gain, timer } = sirenNodes;
  sirenNodes = null;
  try {
    clearInterval(timer);
    gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
    setTimeout(() => {
      try { osc.stop(); } catch { /* noop */ }
      ctx.close().catch(() => {});
    }, 400);
  } catch { /* noop */ }
}

// ---- tones -----------------------------------------------------------------

/** Short double-chime for non-emergency alerts (arrival, check-in). */
export function playChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1174].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch { /* noop */ }
}

/** Vibrate pattern for panic (mobile). */
export function buzz(pattern: number | number[] = [200, 100, 200]) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch { /* noop */ }
}
