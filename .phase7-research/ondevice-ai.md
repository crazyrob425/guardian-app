# Guardian Phase 7 — On-Device AI Research (verified from primary sources)

**Date:** 2026-11-02 (America/Los_Angeles)
**Scope:** Always-on audio sensing, offline speech-to-text, and a small on-device LLM for an Android app that wraps the existing React/Vite Guardian PWA via Capacitor.
**Method:** Primary sources only — official GitHub repos / GitHub API (star counts + SPDX license + `pushed_at`, retrieved 2026-11-02; the unauthenticated API rate-limited mid-pass, so a few counts are marked "approx./not API-verified"), official Google/Android documentation, official model pages (alphacephei.com, TF Hub, Hugging Face `litert-community` / `google` cards), and Picovoice's own repo/docs for commercial terms. Vendor blog/marketing numbers are labelled as such and never used as the sole basis for a recommendation.
**Bottom line up front:** The layered design Rob proposed is not just feasible in 2026 — every layer has a maintained, permissively-licensed, Android-proven implementation. The correct architecture is **three separate small models doing three different jobs**, NOT one LLM listening continuously. A continuously-running LLM is a battery/thermal impossibility; a continuously-running keyword spotter + VAD is a ~1–2 MB model problem that costs milliwatts.

---

## 1. Tier 0 — Always-on cheap ears (keyword spotting, VAD, audio events)

These models run for the whole armed session. They must be tiny, CPU-only, and boringly reliable. All three sub-tasks have a clear winner.

### 1a. Custom keyword / safeword spotting

| Candidate | Repo / stars (2026-11-02) | License | Android status | Custom words? | Size / cost |
|---|---|---|---|---|---|
| **sherpa-onnx KWS** (Zipformer transducer KWS) | github.com/k2-fsa/sherpa-onnx — **★11,699**, Apache-2.0, `pushed_at` 2026-11-01 (actively maintained; a 2.0 major release was in flight Oct 2026 per issue #3731) | Code Apache-2.0. **Model caveat:** the English GigaSpeech KWS model's own README declares Apache-2.0 (verified via issue #3802); the newer zh-en KWS model ships *no* license file — do not ship that one until clarified | First-class: official Android APKs + Kotlin/Java API + AAR builds; min API 21 | **Yes — open-vocabulary.** Any keyword phrase can be specified at runtime as tokens with per-keyword boosting score + trigger threshold, **no retraining**. This is the killer feature for Guardian: the *user's own secret safeword* (e.g. "pineapple") becomes a keyword file entry | Model `sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01` — 3.3M params, ≈15 MB on disk in community Android integrations; designed for always-on use, lower CPU than running its full ASR decoder |
| **openWakeWord** | github.com/dscripka/openWakeWord (star count not API-verified this pass — API rate limit) | Apache-2.0 (code + shared front-end models) — **BUT the pre-trained wake-word models in v0.5.1 are CC BY-NC-SA 4.0 (non-commercial)** per third-party redistributors' source notes; custom-trained classifiers can avoid that trap | No official Android SDK. ONNX/TFLite models exist (mel 1.09 MB + embedding 1.33 MB + classifier ~0.9–1.3 MB per word) and community Kotlin/ONNX-Runtime Android ports exist, but Guardian would own the port | Only via **training a new classifier per word** (synthetic-TTS training pipeline). A user-chosen arbitrary safeword cannot be enrolled at runtime | ~3.7 MB total pipeline; inference every 80 ms frame; cheap |
| **Picovoice Porcupine** | github.com/Picovoice/porcupine — ★~5.9k, SDK code Apache-2.0 | **SDK code Apache-2.0, but runtime requires a Picovoice AccessKey and commercial terms.** Free tier: personal/eval, historically ≤3 monthly active users. Custom wake words are trained in Picovoice Console; Personal console = non-commercial only, commercial distribution requires an Enterprise/commercial agreement. Third-party 2026 comparisons put commercial plans in the ~$899/mo–$6,000/yr range — **treat exact pricing as unconfirmed until quoted by Picovoice** | Excellent native Android SDK, smallest footprint, best-in-class accuracy | Yes, but only words trained through their Console and delivered as proprietary `.ppn` files, gated by the AccessKey | ~2 MB class; very low CPU |

**Verdict — KWS: sherpa-onnx.** It is the only candidate that satisfies Guardian's defining requirement: *an arbitrary, user-chosen safeword, enrolled on the phone, in seconds, with no training run, no vendor account, no per-device fee, and no key that can be revoked.* Porcupine is technically excellent and is the fallback if sherpa KWS false-alarm rates fail field testing — but its licensing model (AccessKey + commercial agreement for distribution + Console-trained words) is structurally wrong for a privacy product whose users may need to change a safeword instantly and whose vendor relationship must never be a single point of failure. openWakeWord's non-commercial pre-trained models and train-per-word workflow disqualify it for user safewords.

Sources: https://github.com/k2-fsa/sherpa-onnx · https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/kws/index.rst · https://github.com/k2-fsa/sherpa-onnx/issues/3802 · https://k2-fsa.github.io/sherpa/onnx/android/prebuilt-apk.html · https://github.com/dscripka/openWakeWord · https://github.com/dscripka/openWakeWord/releases/tag/v0.5.1 · https://github.com/Picovoice/porcupine

### 1b. Voice activity detection (the gate that makes everything else cheap)

| Candidate | Facts |
|---|---|
| **Silero VAD** — github.com/snakers4/silero-vad, ★~8.6k, **MIT** | JIT/ONNX model **~2 MB**; official repo claim: one 30+ ms audio chunk processed in **<1 ms on a single CPU thread**; supports 8 kHz / 16 kHz; runs anywhere ONNX Runtime runs, including Android via sherpa-onnx (sherpa ships Silero VAD as a built-in — one runtime for VAD + KWS + ASR). This is the industry-default VAD in 2026 |
| WebRTC VAD / libfvad | The old WebRTC VAD is a tiny GMM-based C detector (libfvad fork is MIT). Near-zero cost but markedly worse false-trigger behaviour in noisy rooms than Silero. Only worth it on extremely low-end devices |

**Verdict — VAD: Silero VAD (via sherpa-onnx's built-in support).** Pipeline shape: `AudioRecord (16 kHz mono) → Silero VAD gate → only speech frames go to KWS / YAMNet / the ring buffer`. Silence costs almost nothing; the expensive models only wake on sound that is actually speech-like or loud.

Sources: https://github.com/snakers4/silero-vad

### 1c. Audio-event classification (scream / shout / impact / glass / crying)

| Candidate | Facts | Fit |
|---|---|---|
| **YAMNet (TFLite)** — Google, TF Hub `google/yamnet/1` | MobileNet_v1 depthwise-separable net, **521 AudioSet classes**, 16 kHz input, ~0.96 s analysis windows. TFLite file is only **~4 MB class** (≈3.1–3.7M params). Classes include *Screaming, Shout, Yell, Child screaming, Glass breaking/shattering, Slam, Thud, Smashing, Crying/sobbing, Whimper, Groan* — almost a purpose-built distress vocabulary. Apache-2.0 (TF model zoo). Runs via LiteRT/TFLite Task Library audio APIs on Android — mature, documented, boring | **Primary choice.** Cheap enough to run every ~1 s *only while VAD/loudness says something is happening* |
| **PANNs CNN14** — github.com/qiuqiangkong/audioset_tagging_cnn, MIT | 80M+ params, AudioSet mAP 0.431–0.438 — more accurate than YAMNet, but the CNN14 checkpoint is ~300 MB-class and built for 32 kHz/10 s clips in PyTorch. E-PANNs research cuts compute ~36%, still not a phone always-on model | **Reject for Tier 0.** Useful only as an offline teacher model if Guardian ever trains/fine-tunes a small distress head on YAMNet embeddings |
| Newer transformers (AST, BEATs) | 86–90M params, AudioSet SOTA-class accuracy | Server/research models. Not Android always-on candidates in 2026 |

**Critical honesty note:** YAMNet was trained on YouTube audio (AudioSet). "Screaming" detection in a quiet room is plausible; distinguishing a *distress* scream from consensual loud sex, a TV, or laughter is **not a solved problem and no model in this survey claims it is.** Guardian must therefore treat audio events as *one input to an escalation ladder* (haptic check-in → spoken "are you OK?" challenge → cancel window → fake call → circle alert), never as a direct panic trigger. Fine-tuning a small classifier head on YAMNet embeddings with Guardian-specific labelled data is the v2 path; the architecture (embeddings out of YAMNet) supports exactly that.

Sources: https://www.tensorflow.org/hub/tutorials/yamnet · https://github.com/qiuqiangkong/audioset_tagging_cnn

### Tier 0 total footprint
Silero VAD (~2 MB) + sherpa KWS (~15 MB) + YAMNet TFLite (~4 MB) + a simple energy/loudness detector (code, no model) ≈ **~21 MB of models**, all CPU, all Apache-2.0/MIT. This whole tier is cheaper than one minute of LLM inference.

---

## 2. Tier 1 — Offline speech-to-text (wakes on trigger or on command)

Two distinct jobs live here and they want *different* engines:
- **(a) Live command transcription** — short utterances ("extend me thirty minutes"), needs streaming partials and low latency.
- **(b) Trigger-clip transcription** — after a Tier-0 trigger, transcribe the buffered last ~30 s + following speech for the escalation decision and (user-opted-in) evidence log. Needs accuracy, can take a few seconds.

| Engine | Models / sizes | License | Android reality | Real-time factor (RTF) |
|---|---|---|---|---|
| **sherpa-onnx streaming Zipformer (ASR)** | `sherpa-onnx-streaming-zipformer-en-20M` int8 ≈ **20 MB total**; bilingual zh-en small ≈ 70–103 MB. Same runtime, same Kotlin API, same process as Tier-0 KWS/VAD | Apache-2.0 (code); check each model's card | Official Android support; streaming partial results; documented as real-time even on Cortex-A-class CPUs for the 20M model | Streaming by construction — partials in ~200–500 ms chunks; effectively RTF ≪ 1 |
| **whisper.cpp** — github.com/ggml-org/whisper.cpp, ★~51k, MIT | ggml Whisper: **tiny.en 75 MB** (~273 MB RAM), **base.en 142 MB** (~388 MB RAM), **small.en 466 MB** (~852 MB RAM); quantized variants smaller. Official Android example (`examples/android`) + JNI | MIT (code + Whisper weights are MIT) | The accuracy reference for offline phone STT. Non-streaming (windowed) — fine for clip transcription, clunkier for live commands | Community + project-issue benchmarks (labelled as such, not vendor): release-build tiny.en transcribes 11 s of audio in ~5 s on an older Android device (RTF ~0.45); base.en on Pixel-9-class hardware reported ~2–5× real-time. A 30 s distress clip with base.en ≈ a few seconds of compute on a mid-range phone |
| **Vosk** — github.com/alphacep/vosk-api, Apache-2.0 | `vosk-model-small-en-us-0.15` = **40 MB**, official page states ~**300 MB runtime RAM**, LibriSpeech WER 9.85; big models 128 MB–2.3 GB | Apache-2.0 | Mature Android library; streaming; **dynamic vocabulary / grammar restriction** — excellent for a fixed command grammar ("check in", "extend", client names) | Designed for real-time on phones/Raspberry Pi; small model is the low-end champion |

**Verdict — STT:**
- **Live commands → sherpa-onnx streaming Zipformer 20M** (already in the process for KWS; zero new runtime; streaming partials make voice control feel instant).
- **Trigger clips / journal transcription → whisper.cpp base.en** (best accuracy-per-MB offline; MIT-clean). tiny.en on low-end devices.
- **Low-end fallback → Vosk small (40 MB)** with a restricted command grammar — deterministic, tiny RAM, and the grammar restriction actually *raises* command reliability on weak hardware.
- Do not ship all three in the base install. Base APK carries sherpa (KWS+VAD+streaming ASR); Whisper/Vosk ship in the downloadable AI pack.

Sources: https://github.com/ggml-org/whisper.cpp · https://alphacephei.com/vosk/models.html · https://github.com/alphacep/vosk-api · https://k2-fsa.github.io/sherpa/onnx/index.html

---

## 3. Tier 2 — Small on-device LLM (wakes only to think)

### 3a. Runtimes

| Runtime | Status in 2026 | License | Android / Kotlin | Notes |
|---|---|---|---|---|
| **LiteRT-LM** — github.com/google-ai-edge/LiteRT-LM (~6.5k ★ as of Sep 2026, secondary count) | Google's **production-ready** successor stack. Google's own docs position it as the current path; **MediaPipe LLM Inference API is deprecated in its favour** | Apache-2.0 | **Native Kotlin API** (also C++/Python; Swift/JS earlier-stage). CPU (XNNPACK), GPU, and NPU backends (Qualcomm QNN, MediaTek NeuroPilot, Google Tensor). Models in single-file `.litertlm` format from Hugging Face `litert-community` | The default choice for an Android-first product in 2026. One vendor, actively released (v0.17.x line, Sep 2026), function-calling support present in current releases |
| MediaPipe LLM Inference (`tasks-genai`) | **Deprecated / legacy.** Still works (many apps shipped on 0.10.x), Google pushes migration to LiteRT-LM | Apache-2.0 | Kotlin | Do not start new work here |
| **MLC LLM** — github.com/mlc-ai/mlc-llm (~23k ★ class) | Maintained, universal deployment via TVM; Android SDK + demo app; OpenAI-compatible API, JSON mode and function-calling support inherited from its stack (WebLLM documents JSON-mode/function-calling) | Apache-2.0 | Android via its Java/Kotlin SDK | Real alternative, best if Guardian later wants the *same* models on iOS/desktop. Cost: models must be compiled per GPU family — an operational burden LiteRT-LM's prebuilt `.litertlm` files avoid |
| **llama.cpp** — github.com/ggml-org/llama.cpp | The ubiquitous GGUF runtime; official Android example + many JNI wrappers; Vulkan GPU offload on Android is usable-but-experimental, CPU NEON is the reliable path | MIT | Via JNI (C++ core) — no first-party Kotlin API | Widest model choice (any GGUF on Hugging Face), **best structured-output story** (GBNF grammars + JSON-Schema-to-grammar conversion built in — output can be *constrained* to valid JSON, not merely prompted for it). The pragmatic fallback / cross-check runtime |

Sources: https://github.com/google-ai-edge/LiteRT-LM · https://developers.google.com/edge/litert-lm/overview · https://github.com/mlc-ai/mlc-llm · https://github.com/ggml-org/llama.cpp

### 3b. Which models actually run on a 6–8 GB phone?

Numbers below are from Google's official LiteRT-LM model table / `litert-community` cards (Galaxy S24/S25/S26 Ultra-class flagships — derate ~30–50% for a mid-range Snapdragon 7 / Dimensity 8000 phone, more for anything older):

| Model | Download size | RAM in use | Decode speed (flagship) | License | Fit for Guardian |
|---|---|---|---|---|---|
| **FunctionGemma 270M** (Gemma 3 270M fine-tuned for function calling) | **~288 MB** | **~550 MB** | Very fast (270M class; community reports ~126 tok/s decode on desktop-class CPU, phone will be slower but this model is effectively instant for short calls) | **Gemma Terms of Use** (Google's custom license — not OSI open source; includes use restrictions / acceptable-use policy) | **Guardian's Tier-2 sweet spot.** Purpose-built to turn "start a session with Marcus at nine, one hour, deposit paid" into a structured function call. Google's own AI Edge Gallery "Mobile Actions" demo does exactly this. Base accuracy ~58% on mobile actions, **~85% after fine-tuning on your own function set** (Google's figures) — Guardian has a tiny, fixed function set (~15 actions), which is the ideal fine-tune target. Runs even on 4 GB phones |
| **Gemma 3 1B IT** (int4, `.litertlm`) | **529 MB** (dynamic int4 card) – some NPU-specific builds are 1,005 MB–1,704 MB in Google's table; the variant matters, check the exact card before shipping | ~626 MB (NPU build) – ~1.1–1.2 GB (CPU/GPU builds) | S24 Ultra: **47 tok/s CPU / 56 tok/s GPU**; S25 Ultra NPU: **85 tok/s** (Google/litert-community cards) | Gemma Terms | The general-chat / free-form parsing tier: booking details dictated in natural rambling speech, journal summaries, "explain this alert" — 1B int4 is genuinely comfortable on 6 GB |
| **Qwen2.5-1.5B** (int8 LiteRT / Q4 GGUF ~1 GB) | ~1.0–1.7 GB depending on quant/build | ~1.5–2 GB | ~31–34 tok/s on S25 Ultra (GPU/CPU, litert-community figures) | **Apache-2.0** (Qwen2.5's smaller sizes are Apache-2.0 — the license-cleanest capable option) | The pick if Gemma Terms are unacceptable, or via llama.cpp GGUF. Slightly heavier than Gemma 1B for similar command work |
| **Gemma 3n E2B** | **2,965 MB** (Google table) | ~1.7 GB (GPU build, S26 Ultra card) | S24 Ultra: **16 tok/s**; S26 Ultra: 47 CPU / 52 GPU tok/s | Gemma Terms | Multimodal (audio/vision in) — tempting for direct audio understanding, but 3 GB download + 16 tok/s on last-gen flagships = **flagship-only optional pack**, never the default |
| Gemma 3n E4B | 4,235 MB | 3 GB+ observed on Pixel 8 Pro CPU in a hands-on report | S24 Ultra: **9 tok/s** | Gemma Terms | **Reject** for Guardian's audience. Too big, too slow, thermal-hostile |
| Llama 3.2 1B/3B (GGUF Q4) | ~0.8 GB / ~2.0 GB | ~1–2.5 GB | llama.cpp CPU: usable (1B class is the realistic one) | **Llama Community License** (not OSI; MAU ceiling + acceptable-use policy) | Viable via llama.cpp, but license is more encumbered than Qwen's Apache-2.0 for no capability win at this size. Third choice |

**Realistic expectations, stated plainly:** on a 6–8 GB mid-range phone, expect Gemma-3-1B-class decode in the **15–35 tok/s** range (CPU) — more than enough, because Guardian's LLM outputs are *short*: a function call is 30–80 tokens ≈ **1–4 seconds end-to-end**. Nobody is writing essays. Cold model load is several seconds and ~0.5–3 GB of storage per model — hence: **models are an optional in-app download ("Guardian AI Pack"), never bundled in the base APK**, and the LLM is loaded on demand, used, and unloaded.

### 3c. Function calling / structured JSON — the honest state

- **LiteRT-LM** lists function calling for Gemma-family models in current releases, and FunctionGemma exists precisely for this. In practice, the robust production pattern (also recommended in LiteRT-LM community guides) is: system-prompt the tool schemas → parse the emitted call → **validate against a JSON Schema in Kotlin → execute or reject**. Never execute raw model output.
- **llama.cpp** offers the strongest guarantee: GBNF grammar-constrained sampling can make invalid JSON *impossible to emit*. If field testing shows LiteRT-LM function calls are flaky, the fallback is FunctionGemma/Gemma-1B via llama.cpp with a grammar for Guardian's action schema.
- **MLC/WebLLM** expose OpenAI-style JSON mode + function calling.
- Guardian-specific rule regardless of runtime: **the LLM proposes; deterministic native code disposes.** Panic, duress, and alert-sending paths are never gated on, or executed by, the LLM. The LLM may *request* `triggerFakeCall` or `extendSession`; a Kotlin validator checks session state and either performs it or asks a clarifying question. Safety-critical triggers (safeword, scream-ladder, dead-man's switch, hardware buttons) bypass the LLM entirely.

### 3d. How Capacitor bridges to all of this (official pattern)

Capacitor's official docs define exactly this shape — a **local plugin**:

1. **TypeScript side:** `const GuardianAI = registerPlugin<GuardianAIPlugin>('GuardianAI')` with a typed interface (`startMonitoring(opts)`, `stopMonitoring()`, `transcribeClip()`, `runCommand(text)`, plus event listeners).
2. **Kotlin side:** a class in the Android app module annotated `@CapacitorPlugin(name = "GuardianAI")` extending `com.getcapacitor.Plugin`, with `@PluginMethod` functions taking a `PluginCall`; registered via `registerPlugin(GuardianAIPlugin::class.java)` in `MainActivity` (a `BridgeActivity`). Long-lived results (KWS hits, VAD events, escalation state changes) are pushed to the web layer with `notifyListeners("eventName", JSObject)`.
3. **The critical architectural rule:** the plugin is only a *remote control*. It starts/stops an Android **Foreground Service** (Kotlin) that owns `AudioRecord`, the sherpa-onnx JNI runtime, YAMNet (LiteRT), and the escalation state machine. The service must keep protecting the user **with the WebView killed, the app swiped away, or the phone locked** — any design where monitoring lives in WebView JavaScript is disqualified on safety grounds. LiteRT-LM's Kotlin API and whisper.cpp's JNI both slot into this same native module; nothing in Tier 0–2 ever runs in the WebView.
4. Model files live in app-private storage (`filesDir`), downloaded post-install with checksum verification — Play's app-bundle size limits and low-end storage both demand it.

Sources: https://capacitorjs.com/docs/android/custom-code · https://capacitorjs.com/docs/plugins/android

---

## 4. Battery, thermal, and Android 14/15 platform reality

### 4a. Battery / thermal (engineering estimates — must be validated on real hardware)

No primary source publishes a "Guardian workload" power number; the figures below are engineering estimates derived from component behaviour, **flagged as estimates to be measured on Rob's Pixel 9 Pro XL and one mid-range device with Android Battery Historian / Perfetto before any marketing claim is made**:

| Workload | Estimated draw | 1–2 h session cost (est.) |
|---|---|---|
| AudioRecord 16 kHz + Silero VAD + sherpa KWS (Tier 0 core, CPU, screen off) | ~150–350 mW sustained (one small core busy) | **~3–7%** of a ~15 Wh battery |
| + YAMNet every ~1 s during sound events | + tens of mW averaged (bursts) | + ~1–2% |
| + GPS foreground tracking (already in Guardian's session design) | ~100–200 mW class | + ~2–4% — the mic tier is *not* the dominant cost; GPS + radios are comparable or worse |
| STT bursts (Zipformer streaming while user speaks; Whisper on a 30 s clip) | 1–3 W for seconds | Negligible per event |
| **LLM burst** (Gemma 1B, ~50 output tokens) | **3–8 W for 2–5 s** (all big cores / GPU) | Negligible *if* per-command. **Continuous LLM inference would drain ~25–50%/hour and thermally throttle within minutes — this is why the LLM is never in the always-on path** |
| Thermal reality | Sustained multi-watt loads throttle after ~10–20 min on most phones. Tier 0 is deliberately sized to sit *under* the sustained thermal envelope (~<0.5 W). The moment a design needs sustained >1 W, it is wrong for a 2 h session | — |

Design rules that follow: duty-cycle YAMNet behind the VAD/loudness gate; keep the LLM unloaded except during a command; drop KWS to a lower inference cadence when the battery is <20% or the device reports thermal throttling (`PowerManager` thermal status API); show the user an honest "AI monitoring costs roughly X%/hour on your phone" line measured from *their* device after the first session.

### 4b. Android 14 / 15 constraints (official Android documentation)

- **FGS type is mandatory:** targeting API 34+, a microphone foreground service must declare `android:foregroundServiceType="microphone"` in the manifest, hold the `FOREGROUND_SERVICE_MICROPHONE` permission **and** the runtime `RECORD_AUDIO` permission, and pass the type to `startForeground()` — missing any piece throws (`MissingForegroundServiceTypeException` / `SecurityException`). Same pattern for `location` (Guardian needs both types on its session service).
- **While-in-use restriction:** a microphone FGS **cannot be started while the app is in the background** (Android 14+) — the service must be started from a user-visible, foreground interaction. For Guardian this is a feature, not a bug: *monitoring can only be armed by an explicit in-app user action*, which is exactly the consent story. It also means "auto-arm when I arrive" geofence tricks cannot silently start the mic.
- **BOOT_COMPLETED:** Android 15 receivers may **not** launch `microphone` (also `dataSync`, `camera`, `mediaPlayback`, `phoneCall`, `mediaProjection`) FGS. No resume-monitoring-after-reboot — the user re-arms. Again: consent-aligned.
- **Timeouts:** Android 15's 6-hours-per-24h timeout applies to `dataSync` and `mediaProcessing` FGS types — **not** to `microphone`/`location`. A 1–2 h Guardian session is unaffected; don't implement session sync as a `dataSync` FGS or it inherits the clock.
- **Visible indicators are non-negotiable:** Android 12+ shows the green mic indicator + privacy dashboard entry whenever the mic is hot, and an FGS must post a persistent notification. **There is no covert mode and Guardian must not want one** — the notification is the trust artefact ("Guardian is listening — tap to stop"), and Play review will look for it.
- **Google Play declarations:** using FGS types requires a Play Console **Foreground Services declaration** (per-type justification + demo video); background location requires its own declaration + prominent in-app disclosure before the permission prompt; mic/location are sensitive data in the **Data Safety** section. "Audio is processed on-device and never leaves the phone" is a *strong* Data Safety position — on-device processing that never transmits is the most favourable declaration available — but it must be literally true of the shipped binary (no analytics SDK quietly uploading audio-adjacent data).
- **Category risk (carried over from RESEARCH_V2):** app stores are hostile to this product category. The generic personal-safety positioning of the base app + the FGS/location declarations are a coherent, honest submission story; the adult-entertainment experience pack should be distributed as an in-app content/theme download, described in the listing only as a professional-safety configuration — never as store-listing copy.

Sources: https://developer.android.com/about/versions/15/behavior-changes-15 · https://developer.android.com/develop/background-work/services/foreground-services · https://developer.android.com/develop/background-work/services/fgs/service-types · https://support.google.com/googleplay/android-developer/answer/13392821

---

## 5. Recommended layered stack

```
┌─ Web layer (existing React app, unchanged) ─────────────────────┐
│  UI, sessions, circle, payments, settings, pack theming          │
└──────────────▲──────────────────────────────┬───────────────────┘
        events │ (notifyListeners)     calls │ registerPlugin('GuardianAI')
┌──────────────┴──────────────────────────────▼───────────────────┐
│  Kotlin Capacitor plugin (thin remote control)                   │
└──────────────┬──────────────────────────────┬───────────────────┘
┌──────────────▼──────────────────────────────▼───────────────────┐
│  GuardianMonitorService — Foreground Service (microphone|location)│
│  Owns everything safety-critical. Survives WebView death.        │
│                                                                  │
│  TIER 0 — EARS (always on while armed, ~21 MB, <0.5 W)           │
│   AudioRecord 16 kHz → ring buffer (RAM only, ~2 min)            │
│   Silero VAD (sherpa-onnx) → gate                                │
│   sherpa-onnx KWS → user safeword + fixed distress phrases       │
│   YAMNet (LiteRT) → scream/shout/glass/impact, VAD-gated         │
│   → escalation ladder (native, deterministic, NO LLM)            │
│                                                                  │
│  TIER 1 — STT (on trigger / on command)                          │
│   sherpa streaming Zipformer 20M — live voice commands           │
│   whisper.cpp base.en — trigger-clip + journal transcription     │
│                                                                  │
│  TIER 2 — BRAIN (on demand only, unloaded after use)             │
│   LiteRT-LM + FunctionGemma 270M — speech → validated function   │
│     calls against Guardian's ~15-action schema                   │
│   LiteRT-LM + Gemma 3 1B (optional pack) — free-form parsing,    │
│     journal summaries                                            │
│   Kotlin schema validator executes or clarifies. LLM never       │
│   touches panic/duress/alert paths directly.                     │
└──────────────────────────────────────────────────────────────────┘
```

### Fallbacks by device tier

| Device tier | Tier 0 | Tier 1 | Tier 2 |
|---|---|---|---|
| **Low-end** (≤4 GB RAM, old SoC) | Same (it is designed for this) — YAMNet cadence reduced | Vosk small (40 MB) grammar commands instead of Zipformer; whisper tiny.en for clips | **No LLM.** Deterministic grammar/intent parser over Vosk output covers the fixed command set. This is not a degraded experience for commands — a fixed grammar is *more* reliable than a 270M model, just less flexible |
| **Mid-range** (6–8 GB) — the design target | Full | Zipformer streaming + whisper base.en | FunctionGemma 270M (288 MB download) |
| **Flagship** (8 GB+, modern NPU/GPU) | Full + faster YAMNet cadence | Same | + Gemma 3 1B pack (529 MB) for free-form dictation/summaries; NPU builds where Google ships them for the SoC |

### Licensing summary (ship-blockers checked)
- All runtimes in the recommended stack: **Apache-2.0** (sherpa-onnx, LiteRT-LM, Vosk, YAMNet/TFLite models) or **MIT** (Silero VAD, whisper.cpp). No copyleft, no per-device fees, no runtime keys.
- **Model licenses differ from code licenses:** Gemma-family weights (incl. FunctionGemma) are under **Gemma Terms of Use**, not Apache — commercial use is permitted but with Google's acceptable-use conditions; legal should read them once before launch. The Apache-clean alternative at Tier 2 is **Qwen2.5-1.5B**. sherpa's English GigaSpeech KWS model declares Apache-2.0 in its own README; avoid sherpa models that ship no license file.
- **Picovoice Porcupine is the only candidate rejected on licensing/commercial structure** (AccessKey + commercial agreement + Console-gated custom words), despite excellent technology.

### Open risks to retire in the prototype phase
1. **YAMNet distress accuracy in real rooms** (TV, consensual noise) — needs a labelled field-test corpus; the escalation ladder must absorb false positives gracefully. Highest-risk item in Phase 7.
2. **sherpa KWS false-alarm rate on user-chosen safewords** in noisy environments — measurable in a day with Rob's Pixel; Porcupine is the paid fallback.
3. **Battery/thermal estimates above are estimates** — measure on a Pixel 9 Pro XL + one mid-range phone before publishing any number.
4. **LiteRT-LM is pre-1.0 versioning** (v0.17.x) with a fast cadence — pin a version; llama.cpp + GGUF is the escape hatch.
5. **Play declaration timeline** for FGS + background location can take weeks — file declarations early, in parallel with the prototype, not after it.

---

## Sources (primary)

- sherpa-onnx: https://github.com/k2-fsa/sherpa-onnx · KWS docs: https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/kws/index.rst · KWS model license issue: https://github.com/k2-fsa/sherpa-onnx/issues/3802 · Android APKs: https://k2-fsa.github.io/sherpa/onnx/android/prebuilt-apk.html
- openWakeWord: https://github.com/dscripka/openWakeWord · v0.5.1 models: https://github.com/dscripka/openWakeWord/releases/tag/v0.5.1
- Porcupine: https://github.com/Picovoice/porcupine · https://picovoice.ai/platform/porcupine/
- Silero VAD: https://github.com/snakers4/silero-vad
- YAMNet: https://www.tensorflow.org/hub/tutorials/yamnet · PANNs: https://github.com/qiuqiangkong/audioset_tagging_cnn
- whisper.cpp: https://github.com/ggml-org/whisper.cpp · Vosk models: https://alphacephei.com/vosk/models.html · Vosk API: https://github.com/alphacep/vosk-api
- LiteRT-LM: https://github.com/google-ai-edge/LiteRT-LM · https://developers.google.com/edge/litert-lm/overview · NPU/model table: https://developers.google.com/edge/litert/next/litert_lm_npu · FunctionGemma in AI Edge Gallery: https://developers.googleblog.com/on-device-function-calling-in-google-ai-edge-gallery/ · litert-community models: https://huggingface.co/litert-community
- MLC LLM: https://github.com/mlc-ai/mlc-llm · llama.cpp: https://github.com/ggml-org/llama.cpp
- Capacitor custom native code / plugins: https://capacitorjs.com/docs/android/custom-code · https://capacitorjs.com/docs/plugins/android
- Android 15 behaviour changes (FGS timeouts, BOOT_COMPLETED): https://developer.android.com/about/versions/15/behavior-changes-15 · FGS types: https://developer.android.com/develop/background-work/services/fgs/service-types · Play FGS declaration: https://support.google.com/googleplay/android-developer/answer/13392821

*Star counts retrieved via the GitHub API on 2026-11-02 where stated; the API rate-limited partway through the pass, so counts marked "approx./class" are rounded from the nearest primary-adjacent listing and should be re-pulled before being quoted publicly.*
