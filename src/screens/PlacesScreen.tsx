import { useEffect, useState } from "react";
import { TopBar, Card, Btn, Field, inputCls } from "../components/ui";
import { db, type PlaceRow } from "../lib/db";
import { getCurrentPosition, formatDist, distanceM } from "../lib/geo";

/**
 * Safe places (Phase 5): her trusted locations — a friend's house, a staffed
 * hotel lobby, a precinct. Stored on-device; the session screen shows the
 * nearest one and its distance live, so "get to safety" has an address.
 */
export default function PlacesScreen(props: { onBack: () => void }) {
  const [rows, setRows] = useState<PlaceRow[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => setRows(await db.places.orderBy("name").toArray());
  useEffect(() => { void reload(); }, []);

  const addHere = async () => {
    if (!name.trim()) { setMsg("Name the place first (e.g. “Maria's”, “Hotel lobby”)."); return; }
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      await db.places.add({ name: name.trim(), lat: pos.lat, lng: pos.lng, radiusM: 150 });
      setName("");
      setMsg("Safe place saved — on this device only.");
      setTimeout(() => setMsg(""), 3000);
      void reload();
    } catch {
      setMsg("Couldn't get your location — check location permission and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh pb-10">
      <TopBar title="Safe places" onBack={props.onBack} />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <Card className="space-y-3">
          <p className="text-sm text-zinc-300">Places you can get to fast when something feels wrong. Stand in the spot, name it, save it — during a session, Guardian shows the nearest one and how far away it is.</p>
          <Field label="Place name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria's house, precinct, 24h diner" /></Field>
          <Btn variant="primary" onClick={() => void addHere()} disabled={busy}>{busy ? "Getting location…" : "📍 Save this spot as a safe place"}</Btn>
          {msg && <p className="text-sm text-emerald-300">{msg}</p>}
        </Card>
        <div className="space-y-2">
          {rows.map((p) => (
            <Card key={p.id} className="!p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">🏠 {p.name}</p>
                  <p className="text-xs text-zinc-600">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</p>
                </div>
                <button onClick={async () => { if (p.id && window.confirm("Remove this safe place?")) { await db.places.delete(p.id); void reload(); } }} className="text-zinc-600 hover:text-red-300" aria-label="Remove">✕</button>
              </div>
            </Card>
          ))}
          {rows.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">No safe places yet.</p>}
        </div>
      </div>
    </div>
  );
}

export async function nearestPlace(myPos: { lat: number; lng: number } | null): Promise<{ name: string; dist: string } | null> {
  if (!myPos) return null;
  const all = await db.places.toArray();
  if (!all.length) return null;
  let best: { name: string; d: number } | null = null;
  for (const p of all) {
    const d = distanceM(myPos, { lat: p.lat, lng: p.lng });
    if (!best || d < best.d) best = { name: p.name, d };
  }
  return best ? { name: best.name, dist: formatDist(best.d) } : null;
}
