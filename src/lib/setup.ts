// First-run setup wizard state (Phase 6). Progress persists per step so a
// half-finished setup resumes exactly where she stopped — setups get
// interrupted by life, that's the whole point of the app.

const K = "guardian.setup.v1";

export interface SetupState {
  step: number;
  done: boolean;
}

export function getSetup(): SetupState {
  try {
    const raw = localStorage.getItem(K);
    if (raw) return JSON.parse(raw) as SetupState;
  } catch { /* fresh */ }
  return { step: 0, done: false };
}

export function saveSetup(s: SetupState) {
  try {
    localStorage.setItem(K, JSON.stringify(s));
  } catch { /* noop */ }
}

export function setupDone(): boolean {
  return getSetup().done;
}

export const SETUP_STEP_COUNT = 9;
