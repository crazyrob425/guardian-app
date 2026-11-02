import { useEffect, useState } from "react";
import { TopBar, Card, Btn, Field, inputCls } from "../components/ui";
import { db, type BookingRow } from "../lib/db";

/**
 * Booking board (Phase 5): what's coming up, what's done, who no-showed.
 * All on-device. "Start" hands the booking to the date-setup flow as a
 * one-shot prefill so a booking becomes a protected session in two taps.
 */
export default function BookingsScreen(props: { onBack: () => void; go: (r: string) => void }) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [alias, setAlias] = useState("");
  const [when, setWhen] = useState("");
  const [durationMin, setDurationMin] = useState("60");
  const [location, setLocation] = useState("");
  const [deposit, setDeposit] = useState("");

  const reload = async () => setRows(await db.bookings.orderBy("ts").reverse().toArray());
  useEffect(() => { void reload(); }, []);

  const add = async () => {
    const ts = when ? new Date(when).getTime() : Date.now();
    await db.bookings.add({
      ts, alias: alias.trim() || "Guest", durationMin: parseInt(durationMin) || 60,
      location: location.trim(), deposit: parseFloat(deposit) || 0, status: "booked", note: "",
    });
    setAdding(false); setAlias(""); setLocation(""); setDeposit("");
    void reload();
  };

  const setStatus = async (b: BookingRow, status: BookingRow["status"]) => {
    if (b.id) await db.bookings.update(b.id, { status });
    if (status === "noshow" && b.clientId) {
      const c = await db.clients.get(b.clientId);
      if (c) await db.clients.update(b.clientId, { noShows: (c.noShows ?? 0) + 1 });
    }
    void reload();
  };

  const start = (b: BookingRow) => {
    try {
      localStorage.setItem("guardian.prefill.v1", JSON.stringify({ alias: b.alias, durationMin: b.durationMin, location: b.location }));
    } catch { /* noop */ }
    props.go("#/date");
  };

  const upcoming = rows.filter((r) => r.status === "booked").sort((a, b) => a.ts - b.ts);
  const past = rows.filter((r) => r.status !== "booked");

  const Row = (b: BookingRow) => (
    <Card key={b.id} className="!p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-zinc-100">{b.alias}</p>
          <p className="text-xs text-zinc-500">
            {new Date(b.ts).toLocaleString()} · {b.durationMin} min{b.location ? ` · ${b.location}` : ""}{b.deposit ? ` · $${b.deposit} deposit` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${b.status === "booked" ? "bg-sky-500/15 text-sky-300" : b.status === "done" ? "bg-emerald-500/15 text-emerald-300" : b.status === "noshow" ? "bg-red-500/15 text-red-300" : "bg-white/10 text-zinc-400"}`}>{b.status}</span>
      </div>
      {b.status === "booked" && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Btn variant="primary" onClick={() => start(b)}>Start</Btn>
          <Btn onClick={() => void setStatus(b, "done")}>Done</Btn>
          <Btn onClick={() => void setStatus(b, "noshow")}>No-show</Btn>
          <Btn variant="danger" onClick={() => void setStatus(b, "cancelled")}>Cancel</Btn>
        </div>
      )}
    </Card>
  );

  return (
    <div className="min-h-dvh pb-10">
      <TopBar title="Bookings" onBack={props.onBack} />
      <div className="mx-auto max-w-lg space-y-3 px-4 py-4">
        {!adding ? (
          <Btn variant="primary" onClick={() => setAdding(true)}>+ Add a booking</Btn>
        ) : (
          <Card className="space-y-3">
            <Field label="Who (alias or name)"><input className={inputCls} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. Mike — hotel downtown" /></Field>
            <Field label="When"><input className={inputCls} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
            <div className="flex gap-2">
              <div className="flex-1"><Field label="Minutes"><input className={inputCls} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} inputMode="numeric" /></Field></div>
              <div className="flex-1"><Field label="Deposit $"><input className={inputCls} value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" /></Field></div>
            </div>
            <Field label="Where"><input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Neighborhood / hotel" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="primary" onClick={() => void add()}>Save booking</Btn>
              <Btn onClick={() => setAdding(false)}>Cancel</Btn>
            </div>
          </Card>
        )}

        <p className="pt-2 text-xs uppercase tracking-widest text-zinc-500">Upcoming</p>
        {upcoming.length === 0 && <p className="text-sm text-zinc-600">Nothing booked. Quiet is good — deposits make it louder.</p>}
        {upcoming.map(Row)}
        {past.length > 0 && <p className="pt-3 text-xs uppercase tracking-widest text-zinc-500">History</p>}
        {past.slice(0, 15).map(Row)}
      </div>
    </div>
  );
}
