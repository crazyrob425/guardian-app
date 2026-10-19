// Siren + alert tones via Web Audio. No audio files needed.

let sirenNodes: { ctx: AudioContext; osc: OscillatorNode; gain: GainNode; timer: number } | null = null;

/** Start a loud alternating emergency siren. Returns a stop function. */
export function startSiren(): () => void {
  stopSiren();
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
  // ramp up fast
  gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.4);
  let high = false;
  const timer = window.setInterval(() => {
    high = !high;
    osc.frequency.setTargetAtTime(high ? 1400 : 650, ctx.currentTime, 0.05);
  }, 450);
  sirenNodes = { ctx, osc, gain, timer };
  return stopSiren;
}

export function stopSiren() {
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

export function isSirenOn(): boolean {
  return sirenNodes !== null;
}

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
