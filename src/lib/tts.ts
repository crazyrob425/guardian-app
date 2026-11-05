// Neural voice client for the fake-call personas.
//
// The persona's voice is synthesized by Guardian's own TTS service
// (Kokoro-82M on guardian-core) at voice.blacklisted.studio — a real
// neural voice that can survive being overheard on speaker. The phone's
// built-in speechSynthesis is kept ONLY as an offline fallback; stock
// device voices are robotic and would blow the call's cover instantly.
//
// Persona scripts are finite, so the client prefetches the whole script
// (opening lines first) while the phone is still ringing: by the time
// she answers, the caller's voice is already rendered and cached.

import type { Persona } from "./personas";

const TTS_URL = "https://voice.blacklisted.studio/tts";
const TTS_TOKEN = "e2bf2ef9e35b1abb4149b3266918ec94a009805ea6f1b38b554440d309e00dbc";
const FETCH_TIMEOUT_MS = 15000;

const cache = new Map<string, Promise<Blob | null>>();
let serviceDown = false;

function key(persona: Persona, text: string): string {
  return `${persona.id}|${text}`;
}

/** Re-probe the service on the next call (called when a call starts). */
export function resetTTSHealth() {
  serviceDown = false;
}

async function fetchLine(persona: Persona, text: string): Promise<Blob | null> {
  if (serviceDown) return null;
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TTS-Token": TTS_TOKEN },
      body: JSON.stringify({
        voice: persona.voice.neural.voice,
        speed: persona.voice.neural.speed,
        text,
      }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    return await res.blob();
  } catch {
    serviceDown = true;
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Audio for one persona line, from cache/prefetch or fetched on demand.
 *  Resolves null when the service is unreachable — caller falls back. */
export function lineAudio(persona: Persona, text: string): Promise<Blob | null> {
  const k = key(persona, text);
  let p = cache.get(k);
  if (!p) {
    p = fetchLine(persona, text);
    cache.set(k, p);
  }
  return p;
}

/** Begin rendering the persona's whole script, opening lines first.
 *  Sequential on purpose: the server synthesizes one line at a time. */
export function warmPersonaVoice(persona: Persona): void {
  const lines: string[] = [
    ...persona.opening,
    persona.closing,
    ...Object.values(persona.replies).flat(),
    ...persona.prompts,
  ];
  const seen = new Set<string>();
  void (async () => {
    for (const line of lines) {
      if (seen.has(line)) continue;
      seen.add(line);
      await lineAudio(persona, line);
      if (serviceDown) return;
    }
  })();
}
