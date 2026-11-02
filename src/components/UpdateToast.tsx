import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * "A new version is ready" toast (Phase 4). With registerType autoUpdate the
 * new service worker activates silently — this surfaces it as a one-tap
 * refresh instead of the app quietly running yesterday's build (which bit
 * us repeatedly during the v0.5 deploy saga).
 */
export default function UpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-md rounded-2xl border border-emerald-400/40 bg-[#0d1512] p-4 shadow-2xl">
      <p className="text-sm font-semibold text-zinc-100">A new Guardian version is ready</p>
      <p className="mt-0.5 text-xs text-zinc-400">Safer and better — update now. Any live session keeps running.</p>
      <button
        onClick={() => void updateServiceWorker(true)}
        className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-black"
      >
        Update now
      </button>
    </div>
  );
}
