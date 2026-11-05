import { useEffect, useRef, useState } from "react";
import { Card, Btn, Field, inputCls } from "../components/ui";
import { store, type Settings } from "../lib/store";
import BackupPathsCard from "../components/BackupPathsCard";
import { getSetup, saveSetup, SETUP_STEP_COUNT } from "../lib/setup";
import { hashPin } from "../lib/pin";
import { randomId } from "../lib/crypto";
import { genTopic, sendPush, ntfyConfigured } from "../lib/notify";
import { ALARM_SOUNDS, alarmFileUrl } from "../lib/audio";
import { PERSONAS, getPersona } from "../lib/personas";
import { getCurrentPosition } from "../lib/geo";
import { accountsConfigured, sendMagicLink, currentEmail } from "../lib/account";
import i18n from "../lib/i18n";

/**
 * First-run setup wizard (Phase 6), guided by Sis — the older, sassier
 * sister every girl deserves: friendly, funny, zero judgment, and she
 * does NOT let you skip the important stuff without hearing about it.
 * Every step saves as it goes; leaving mid-wizard resumes right here.
 */

const SIS = [
  { title: "Hey. I'm Sis. 💋", sub: "Your big sister for the next three minutes" },
  { title: "First: your account", sub: "Free forever during beta — pinky swear" },
  { title: "Now, who are you?", sub: "Just the cute stuff, none of the tea" },
  { title: "Lock it down 🔐", sub: "PINs. Plural. Trust me on this one" },
  { title: "Your circle ⭕", sub: "Nobody does this job alone, babe" },
  { title: "Permissions, ugh, I know", sub: "Thirty seconds and they're actually for YOU" },
  { title: "Make some noise 🔊", sub: "Pick the sound that saves your butt" },
  { title: "Backup plans 📡", sub: "When the bars disappear, we shout louder" },
  { title: "Test drive, then done 🎉", sub: "Let's make sure it all actually works" },
];

export default function SetupWizard(props: { go: (r: string) => void; onDone: () => void }) {
  const [step, setStep] = useState(() => getSetup().step);
  const [s, setS] = useState<Settings>(store.getSettings());
  const [err, setErr] = useState("");

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    const next = { ...s, [k]: v };
    setS(next);
    store.saveSettings(next);
  };

  const jump = (n: number) => {
    const clamped = Math.max(0, Math.min(SETUP_STEP_COUNT - 1, n));
    setStep(clamped);
    saveSetup({ step: clamped, done: false });
    setErr("");
    window.scrollTo({ top: 0 });
  };

  const finish = () => {
    saveSetup({ step: 0, done: true });
    props.onDone();
    props.go("#/");
  };

  const sis = SIS[step];

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-16 pt-8">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-500/20 text-3xl ring-2 ring-pink-400/40">💁‍♀️</div>
          <div>
            <h1 className="text-xl font-bold text-zinc-50">{sis.title}</h1>
            <p className="text-sm text-pink-300">{sis.sub}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: SETUP_STEP_COUNT }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-pink-400" : "bg-white/10"}`} />
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-600">Step {step + 1} of {SETUP_STEP_COUNT} · everything saves as we go — bail anytime, I'll be here</p>
      </div>

      {step === 0 && <StepWelcome next={() => jump(1)} skip={finish} />}
      {step === 1 && <StepAccount next={() => jump(2)} />}
      {step === 2 && <StepProfile s={s} set={set} next={() => jump(3)} />}
      {step === 3 && <StepPins s={s} next={() => jump(4)} err={err} setErr={setErr} />}
      {step === 4 && <StepCircle s={s} set={set} next={() => jump(5)} />}
      {step === 5 && <StepPermissions next={() => jump(6)} />}
      {step === 6 && <StepSound s={s} set={set} next={() => jump(7)} />}
      {step === 7 && <StepBackups s={s} set={set} next={() => jump(8)} />}
      {step === 8 && <StepTest s={s} finish={finish} />}

      {step > 0 && (
        <button onClick={() => jump(step - 1)} className="mt-6 text-sm text-zinc-500 underline-offset-2 hover:underline">← Back a step</button>
      )}
    </div>
  );
}

function StepWelcome(props: { next: () => void; skip: () => void }) {
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="text-sm leading-relaxed text-zinc-200">Okay listen. Guardian is the app that watches your back when you're working — panic button, a circle of your people, live location for your dates, the whole bodyguard-in-your-purse fantasy. ✨</p>
        <p className="text-sm leading-relaxed text-zinc-200">I'm gonna set it up WITH you, step by step, in like three minutes. No tech nonsense, no homework. Just tap what I tell you to tap, gorgeous.</p>
        <div className="rounded-xl bg-white/5 p-3 text-sm text-zinc-300">
          <p className="mb-1 font-semibold text-zinc-100">The privacy deal, in plain English:</p>
          <p>Your account (next step) is just your email + which plan you're on. Your locations, clients, money and secrets <strong>never</strong> go in it — those live on this phone only. I don't do snitches. 🤐</p>
        </div>
      </Card>
      <Btn variant="primary" onClick={props.next}>Let's do this, Sis →</Btn>
      <button onClick={props.skip} className="w-full text-center text-sm text-zinc-500 underline-offset-2 hover:underline">I already know my way around (skip setup)</button>
    </div>
  );
}

function StepAccount(props: { next: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [signedIn, setSignedIn] = useState<string | null>(null);

  useEffect(() => { void currentEmail().then(setSignedIn); }, []);

  const send = async () => {
    if (!email.includes("@")) { setMsg("That email looks… incomplete, babe. Try again?"); return; }
    setBusy(true);
    const r = await sendMagicLink(email.trim());
    setBusy(false);
    if (r.ok) { setSent(true); setMsg(""); }
    else setMsg(r.error ?? "Something hiccuped. Try again?");
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="text-sm leading-relaxed text-zinc-200">Your free account is how Guardian knows you're a beta tester — and beta testers get <strong className="text-pink-300">a free year of Pro</strong> when it launches. That's it. That's the whole reason. 💅</p>
        {!accountsConfigured ? (
          <p className="rounded-xl bg-white/5 p-3 text-sm text-zinc-300">Accounts open in like two seconds (backend's still putting its lashes on). Everything's free during beta anyway — skip ahead, I'll claim your free year the second sign-in opens.</p>
        ) : signedIn ? (
          <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">✓ You're signed in as {signedIn}. Beta royalty. Moving on!</p>
        ) : sent ? (
          <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">✓ Check your email, babe — I sent you a magic sign-in link. Tap it, then come back here. You can also just keep going and tap it later; your free year sticks to that email either way.</p>
        ) : (
          <>
            <Field label="Your email">
              <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" inputMode="email" autoComplete="email" />
            </Field>
            <Btn variant="primary" onClick={() => void send()} disabled={busy}>{busy ? "Sending…" : "Email me my magic link ✨"}</Btn>
            {msg && <p className="text-sm text-amber-300">{msg}</p>}
          </>
        )}
      </Card>
      <Btn onClick={props.next}>{signedIn ? "Next →" : "Skip for now →"}</Btn>
      {!signedIn && accountsConfigured && <p className="text-center text-xs text-zinc-600">Skipping is fine. But no account = no free Pro year later. Big sister said what she said. 🤷‍♀️</p>}
    </div>
  );
}

function StepProfile(props: { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void; next: () => void }) {
  const { s, set } = props;
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <p className="text-sm text-zinc-300">This is the name your circle sees when an alert goes out. Make it whatever they actually call you.</p>
        <Field label="Your name (as your people know you)">
          <input className={inputCls} value={s.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="e.g. Alex" />
        </Field>
        <Field label="Language / Idioma">
          <select className={inputCls} value={s.language} onChange={(e) => { const v = e.target.value as Settings["language"]; set("language", v); void i18n.changeLanguage(v); }}>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </Field>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-zinc-200">Discreet mode <span className="text-zinc-500">— renames everything to boring innocent words, for nosy eyes over your shoulder</span></span>
          <button onClick={() => set("discreetMode", !s.discreetMode)} className={`relative h-8 w-14 shrink-0 rounded-full ${s.discreetMode ? "bg-emerald-500" : "bg-white/10"}`}>
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${s.discreetMode ? "left-7" : "left-1"}`} />
          </button>
        </label>
      </Card>
      <Btn variant="primary" onClick={props.next}>That's me →</Btn>
    </div>
  );
}

function StepPins(props: { s: Settings; next: () => void; err: string; setErr: (e: string) => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [duress, setDuress] = useState("");
  const [decoy, setDecoy] = useState("");
  const [busy, setBusy] = useState(false);
  const hasPin = !!props.s.pinHash;

  const save = async () => {
    props.setErr("");
    const s = store.getSettings();
    const next = { ...s };
    if (!hasPin || pin) {
      if (pin.length < 4) { props.setErr("Your main PIN needs at least 4 digits, babe. Make it count."); return; }
      if (pin !== confirm) { props.setErr("Those two PINs don't match. Deep breath, try again."); return; }
      next.pinHash = await hashPin(pin);
    }
    if (duress) {
      if (duress.length < 4) { props.setErr("Duress PIN needs 4+ digits too."); return; }
      if (duress === pin) { props.setErr("Duress PIN can't be the same as your main PIN — that's the whole trick, love."); return; }
      next.duressPinHash = await hashPin(duress);
    }
    if (decoy) {
      if (decoy.length < 4) { props.setErr("Decoy PIN needs 4+ digits."); return; }
      if (decoy === pin || decoy === duress) { props.setErr("Every PIN has to be different, or the magic doesn't work."); return; }
      next.decoyPinHash = await hashPin(decoy);
    }
    store.saveSettings(next);
    setBusy(false);
    props.next();
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <p className="text-sm leading-relaxed text-zinc-300">Three PINs, three superpowers. The <strong>main PIN</strong> locks the app and — this matters — it's the only thing that can stop a blaring panic alarm. Memorize it like your own birthday.</p>
        {hasPin && !pin && <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">✓ Main PIN already set. Leave the boxes empty to keep it, or type a new one to change it.</p>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Main PIN (4+ digits)"><input className={inputCls} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="••••" /></Field>
          <Field label="Say it again"><input className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="••••" /></Field>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <p className="mb-2 text-sm text-zinc-200"><strong>Duress PIN</strong> <span className="text-zinc-500">(optional, genius)</span> — if someone forces you to unlock, THIS pin opens the app like normal… while secretly screaming for help to your circle. 😈</p>
          <input className={inputCls} value={duress} onChange={(e) => setDuress(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="Different from main PIN" />
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <p className="mb-2 text-sm text-zinc-200"><strong>Decoy PIN</strong> <span className="text-zinc-500">(optional, for the nosy)</span> — opens a fake little Notes app instead of Guardian. For "just unlock it for me" moments.</p>
          <input className={inputCls} value={decoy} onChange={(e) => setDecoy(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="Also different" />
        </div>
        {props.err && <p className="text-sm text-amber-300">{props.err}</p>}
      </Card>
      <Btn variant="primary" onClick={() => { setBusy(true); void save(); }} disabled={busy}>{busy ? "Locking it down…" : "Lock it down →"}</Btn>
    </div>
  );
}

function StepCircle(props: { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void; next: () => void }) {
  const [circle, setCircle] = useState(store.getCircle());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const add = () => {
    if (!name.trim()) return;
    const c = [...circle, { id: randomId(8), name: name.trim(), phone: phone.trim() }];
    setCircle(c);
    store.saveCircle(c);
    setName(""); setPhone("");
    if (!props.s.ntfyTopic) props.set("ntfyTopic", genTopic());
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="text-sm leading-relaxed text-zinc-300">Your circle = the humans who get your panic alerts and watch your dates. Your best friend, your roommate, your person. Add at least one — future-you, mid-emergency, says thanks. 💕</p>
        {circle.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
            <span className="text-sm text-zinc-100">🛟 {m.name}{m.phone ? <span className="text-zinc-500"> · {m.phone}</span> : ""}</span>
            <button onClick={() => { const c = circle.filter((x) => x.id !== m.id); setCircle(c); store.saveCircle(c); }} className="text-zinc-600 hover:text-red-300">✕</button>
          </div>
        ))}
        <Field label="Their name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria" /></Field>
        <Field label="Their phone (for text alerts, optional)"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1…" inputMode="tel" /></Field>
        <Btn onClick={add}>+ Add to my circle</Btn>
        <p className="text-xs text-zinc-600">After setup, send them their invite from the Circle screen — that's how their phone pairs up to receive your alerts.</p>
      </Card>
      <Btn variant="primary" onClick={props.next} disabled={circle.length === 0}>{circle.length ? "My people are in →" : "Add at least one person first"}</Btn>
    </div>
  );
}

function StepPermissions(props: { next: () => void }) {
  const [loc, setLoc] = useState<"idle" | "ok" | "fail">("idle");
  const [notif, setNotif] = useState<"idle" | "ok" | "fail">("idle");
  const deferredRef = useRef<Event & { prompt?: () => void } | null>(null);

  useEffect(() => {
    const h = (e: Event) => { deferredRef.current = e as Event & { prompt?: () => void }; e.preventDefault(); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  const doLoc = async () => {
    try { await getCurrentPosition(); setLoc("ok"); } catch { setLoc("fail"); }
  };
  const doNotif = async () => {
    try {
      const r = await Notification.requestPermission();
      setNotif(r === "granted" ? "ok" : "fail");
    } catch { setNotif("fail"); }
  };

  const Row = (label: string, hint: string, state: "idle" | "ok" | "fail", fn: () => void) => (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-3">
      <div><p className="text-sm font-semibold text-zinc-100">{label}</p><p className="text-xs text-zinc-500">{hint}</p></div>
      {state === "ok" ? <span className="text-sm font-bold text-emerald-300">✓ Done</span>
        : <button onClick={fn} className="shrink-0 rounded-lg bg-pink-500/80 px-3 py-2 text-xs font-bold text-white">Turn on</button>}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="text-sm text-zinc-300">I know, permissions are annoying. These two are the entire reason Guardian works, so humor me:</p>
        {Row("📍 Location", "So your circle can find you. Only shared during YOUR sessions, encrypted.", loc, () => void doLoc())}
        {loc === "fail" && <p className="text-xs text-amber-300">Hmm, location said no. Check your browser/phone settings for this site — Guardian is blind without it.</p>}
        {Row("🔔 Notifications", "So alerts actually wake your phone up.", notif, () => void doNotif())}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-3">
          <div><p className="text-sm font-semibold text-zinc-100">📲 Install the app</p><p className="text-xs text-zinc-500">Add Guardian to your home screen — full-screen, faster, no browser fuss.</p></div>
          <button onClick={() => { if (deferredRef.current?.prompt) deferredRef.current.prompt(); else window.alert("In your browser menu, tap “Add to Home Screen” (iPhone: Share → Add to Home Screen). You can do this anytime — no rush."); }} className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-zinc-100">How?</button>
        </div>
      </Card>
      <Btn variant="primary" onClick={props.next}>Good enough →</Btn>
      <p className="text-center text-xs text-zinc-600">You can finish these later in Settings. Sis will nag exactly once more, then never again. Probably.</p>
    </div>
  );
}

function StepSound(props: { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void; next: () => void }) {
  const { s, set } = props;
  const preview = (id: (typeof ALARM_SOUNDS)[number]["id"]) => {
    try { new Audio(alarmFileUrl(id)).play().catch(() => {}); } catch { /* noop */ }
  };
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <p className="text-sm text-zinc-300">When you hit panic, Guardian SCREAMS — pick your scream. Tap ▶ to audition. The help-cry one? Chills. Actual chills.</p>
        <div className="space-y-2">
          {ALARM_SOUNDS.map((d) => (
            <div key={d.id} className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${s.alarmSound === d.id ? "bg-pink-500/15 ring-2 ring-pink-400/40" : "bg-white/5"}`}>
              <button onClick={() => set("alarmSound", d.id)} className="text-left text-sm font-semibold text-zinc-100">{d.name}</button>
              <button onClick={() => preview(d.id)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-100">▶ Hear it</button>
            </div>
          ))}
        </div>
        <Field label="And your fake rescue caller is…">
          <select className={inputCls} value={s.fakeCallPersona} onChange={(e) => { const p = getPersona(e.target.value); set("fakeCallPersona", p.id); set("fakeCallerName", p.name); }}>
            {PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.avatar} {p.name} — {p.blurb}</option>)}
          </select>
        </Field>
        <p className="text-xs text-zinc-600">She calls, she talks, she listens, she gets you OUT of there. And she matches your phone's call screen — set that in Settings anytime.</p>
      </Card>
      <Btn variant="primary" onClick={props.next}>Sounds perfect →</Btn>
    </div>
  );
}

function StepBackups(props: { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void; next: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-zinc-300">
        Okay, real talk: hotel stairwells, basement bars, the middle of nowhere — signals die exactly where dates happen.
        So when Guardian smells a dead zone, it flips into <strong className="text-amber-300">Low Signal Mode</strong> and blasts your
        message out every path you've got, all at once. It remembers which paths actually got through and leads with
        those for the rest of the date. Pick your paths — you can change them anytime in Settings.
      </p>
      <BackupPathsCard s={props.s} set={props.set} />
      <Btn variant="primary" onClick={props.next}>Covered from every angle →</Btn>
    </div>
  );
}

function StepTest(props: { s: Settings; finish: () => void }) {
  const [testState, setTestState] = useState<"idle" | "sent" | "fail" | "nopush">("idle");
  const circle = store.getCircle();
  const test = async () => {
    if (!ntfyConfigured(props.s)) { setTestState("nopush"); return; }
    const ok = await sendPush(props.s, { title: "Guardian test 💅", body: "Sis here — this is what an alert looks like. It works. You're covered.", priority: 4, tags: "white_check_mark" });
    setTestState(ok ? "sent" : "fail");
  };
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="text-sm leading-relaxed text-zinc-200">Last thing, promise. Let's fire a test alert so you KNOW your circle's phones buzz before it ever matters.</p>
        <Btn onClick={() => void test()}>📣 Send a test alert to my circle</Btn>
        {testState === "sent" && <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">✓ Sent! If their phones buzzed, you're officially protected. If not, they need to finish their invite pairing (Circle screen) — send it from there.</p>}
        {testState === "nopush" && <p className="rounded-xl bg-white/5 p-3 text-sm text-zinc-300">Push alerts aren't paired yet — that's the invite step in the Circle screen. Your watch links still work by text/share, so you're not unprotected; just finish the pairing when you can, babe.</p>}
        {testState === "fail" && <p className="text-sm text-amber-300">The test didn't go through — check your connection and try again from Settings later. Not a dealbreaker tonight.</p>}
        <div className="space-y-1.5 rounded-xl bg-white/5 p-3 text-sm text-zinc-300">
          <p>{props.s.pinHash ? "✓" : "○"} Panic PIN {props.s.pinHash ? "locked and loaded" : "not set (Settings, when you're ready)"}</p>
          <p>{circle.length ? "✓" : "○"} {circle.length} person{circle.length === 1 ? "" : "s"} in your circle</p>
          <p>✓ Everything else — screening, bookings, your money log — is already waiting on the home screen</p>
        </div>
        <p className="text-sm text-zinc-300">That's it! Next, I'll give you the quick grand tour, then you're on your own. (You're not on your own. Guardian's got you. And so do I.) 💋</p>
      </Card>
      <Btn variant="primary" onClick={props.finish}>Finish — show me my Guardian 🎉</Btn>
    </div>
  );
}
