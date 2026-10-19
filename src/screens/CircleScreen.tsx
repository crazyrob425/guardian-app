import { useState } from "react";
import { TopBar, Card, Btn, Field, inputCls } from "../components/ui";
import { store, type CircleMember } from "../lib/store";
import { randomId } from "../lib/crypto";

export default function CircleScreen(props: { onBack: () => void }) {
  const [circle, setCircle] = useState<CircleMember[]>(store.getCircle());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");

  const save = (c: CircleMember[]) => {
    setCircle(c);
    store.saveCircle(c);
  };

  const add = () => {
    if (!name.trim() || !phone.trim()) { setErr("Name and phone are required."); return; }
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) { setErr("That phone number looks incomplete."); return; }
    save([...circle, { id: randomId(8), name: name.trim(), phone: phone.trim() }]);
    setName(""); setPhone(""); setErr("");
  };

  const remove = (id: string) => save(circle.filter((m) => m.id !== id));

  return (
    <div className="min-h-dvh">
      <TopBar title="Safety circle" onBack={props.onBack} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <p className="text-sm text-zinc-400">
          The people who get your emergency alerts — panic button, missed check-ins, silent duress signals. They receive a discreet text with a live tracking link. Add at least one person you trust with your life.
        </p>
        {circle.length === 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <p className="text-sm text-amber-200">No one in your circle yet. Alerts have nowhere to go — add someone now.</p>
          </Card>
        )}
        {circle.map((m) => (
          <Card key={m.id} className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-zinc-100">{m.name}</p>
              <p className="text-sm text-zinc-400">{m.phone}</p>
            </div>
            <button onClick={() => remove(m.id)} className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">Remove</button>
          </Card>
        ))}
        <Card>
          <div className="space-y-3">
            <Field label="Name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maya" />
            </Field>
            <Field label="Phone (SMS alerts)" hint="Include country code, e.g. +1…">
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567" inputMode="tel" />
            </Field>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <Btn variant="primary" onClick={add}>Add to circle</Btn>
          </div>
        </Card>
        <p className="text-xs text-zinc-600">
          Alert texts are discreet — they say "Guardian alert" with a tracking link, never what you do or who you're with.
        </p>
      </div>
    </div>
  );
}
