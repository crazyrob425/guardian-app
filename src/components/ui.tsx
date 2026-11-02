import type { ReactNode } from "react";

export function Btn(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "danger" | "ghost" | "emerald";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  "data-tour"?: string;
}) {
  const v = {
    primary: "bg-emerald-500 text-black font-semibold hover:bg-emerald-400",
    danger: "bg-red-600 text-white font-semibold hover:bg-red-500",
    emerald: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25",
    ghost: "bg-white/5 text-zinc-200 border border-white/10 hover:bg-white/10",
  }[props.variant ?? "ghost"];
  return (
    <button
      type={props.type ?? "button"}
      disabled={props.disabled}
      onClick={props.onClick}
      data-tour={props["data-tour"]}
      className={`w-full rounded-xl px-5 py-3.5 text-base transition active:scale-[0.98] disabled:opacity-40 ${v} ${props.className ?? ""}`}
    >
      {props.children}
    </button>
  );
}

export function Card(props: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${props.className ?? ""}`}>
      {props.children}
    </div>
  );
}

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">{props.label}</span>
      {props.children}
      {props.hint && <span className="mt-1 block text-xs text-zinc-500">{props.hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-500/60";

export function TopBar(props: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a0f]/90 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
        {props.onBack && (
          <button onClick={props.onBack} className="rounded-lg p-2 text-zinc-400 hover:bg-white/10" aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <h1 className="flex-1 text-lg font-bold text-zinc-100">{props.title}</h1>
        {props.right}
      </div>
    </div>
  );
}
