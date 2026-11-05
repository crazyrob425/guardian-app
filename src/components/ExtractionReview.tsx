import { useMemo, useState } from "react";
import { Card, Btn } from "./ui";
import type { CandidateFact } from "../lib/extract";

/**
 * Extraction review — the human gate in front of every dossier import
 * (pasted conversation, file import, screenshot OCR, vCard / contacts).
 * The parser proposes; she disposes. Pre-checked = regex-exact
 * identifiers only; everything inferred starts unchecked and nothing
 * reaches the dossier until she confirms it here.
 */
export default function ExtractionReview(props: {
  facts: CandidateFact[];
  rawText?: string;
  onApply: (selected: CandidateFact[], saveRawText: boolean) => void;
  onCancel: () => void;
  applyLabel?: string;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const f of props.facts) init[f.id] = f.preChecked;
    return init;
  });
  const [saveRaw, setSaveRaw] = useState(false);
  const selected = useMemo(() => props.facts.filter((f) => checked[f.id]), [checked, props.facts]);
  const confCls = (c: number) => (c >= 0.9 ? "bg-emerald-500/15 text-emerald-300" : c >= 0.65 ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300");
  const confLabel = (c: number) => (c >= 0.9 ? "exact match" : c >= 0.65 ? "likely" : "guess — check it");

  if (props.facts.length === 0) {
    return (
      <Card>
        <p className="text-sm text-zinc-300">Guardian read it on this device and found nothing it could confidently pull out — no numbers, emails, names, deposits, or references.</p>
        <p className="mt-1 text-xs text-zinc-500">Nothing was saved from that text. You can still type what matters into the dossier yourself.</p>
        <Btn className="mt-3" onClick={props.onCancel}>Back</Btn>
      </Card>
    );
  }

  return (
    <Card>
      <p className="mb-1 text-sm font-semibold text-zinc-100">Review what Guardian found</p>
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
        Everything below was extracted <strong className="text-zinc-300">on this phone only</strong>. Exact matches
        (numbers, emails) come pre-checked; anything Guardian inferred starts unchecked. Only what you leave
        checked gets written to the dossier — the raw text itself is discarded unless you say otherwise below.
      </p>
      <div className="space-y-2">
        {props.facts.map((f) => (
          <label key={f.id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
            <input type="checkbox" checked={!!checked[f.id]}
              onChange={(e) => setChecked((c) => ({ ...c, [f.id]: e.target.checked }))}
              className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-500" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100">{f.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${confCls(f.confidence)}`}>{confLabel(f.confidence)}</span>
              </span>
              <span className="block truncate text-sm text-zinc-300">{f.value}</span>
              {f.snippet && f.snippet !== f.value && <span className="block truncate text-xs italic text-zinc-600">“{f.snippet}”</span>}
            </span>
          </label>
        ))}
      </div>
      {props.rawText != null && (
        <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
          <input type="checkbox" checked={saveRaw} onChange={(e) => setSaveRaw(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-500" />
          <span>Also save the full conversation to this client&apos;s comms log <span className="block text-xs text-zinc-500">Stays on this phone like everything else. Off by default — imports normally leave no copy behind.</span></span>
        </label>
      )}
      <div className="mt-4 flex gap-2">
        <Btn variant="primary" disabled={selected.length === 0 && !saveRaw} onClick={() => props.onApply(selected, saveRaw)}>
          {props.applyLabel ?? `Add ${selected.length} confirmed fact${selected.length === 1 ? "" : "s"}`}
        </Btn>
        <Btn onClick={props.onCancel}>Discard</Btn>
      </div>
    </Card>
  );
}
