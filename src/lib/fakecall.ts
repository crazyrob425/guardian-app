// Fake rescue call (Phase 2). A scheduled, realistic incoming-call screen
// with ringtone and a scripted voice on answer — the graceful-exit tool.
// Scheduling lives in localStorage so it survives navigation and the App
// host can fire it from any screen.

const K = "guardian.fakecall.v1";

export interface FakeCallPlan {
  at: number; // epoch ms when the "call" arrives
}

export function scheduleFakeCall(delayMin: number): FakeCallPlan {
  const plan = { at: Date.now() + delayMin * 60000 };
  try {
    localStorage.setItem(K, JSON.stringify(plan));
  } catch { /* noop */ }
  return plan;
}

export function fakeCallDue(): boolean {
  try {
    const raw = localStorage.getItem(K);
    if (!raw) return false;
    const plan = JSON.parse(raw) as FakeCallPlan;
    return Date.now() >= plan.at;
  } catch {
    return false;
  }
}

export function clearFakeCall() {
  try {
    localStorage.removeItem(K);
  } catch { /* noop */ }
}

export function pendingFakeCall(): FakeCallPlan | null {
  try {
    const raw = localStorage.getItem(K);
    return raw ? (JSON.parse(raw) as FakeCallPlan) : null;
  } catch {
    return null;
  }
}
