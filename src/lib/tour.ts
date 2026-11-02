// First-run safety tour (Phase 4, driver.js): five short stops on the Home
// screen that teach the moves that matter BEFORE they're needed — panic,
// check-in/out, the circle, the client log, and the rescue call. Runs once;
// replayable from Settings. Never interrupts a live session or an alarm.

import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const K = "guardian.tourDone.v1";

export function tourDone(): boolean {
  try { return !!localStorage.getItem(K); } catch { return true; }
}

export function resetTour() {
  try { localStorage.removeItem(K); } catch { /* noop */ }
}

export function startTour() {
  const d = driver({
    showProgress: true,
    overlayOpacity: 0.75,
    stagePadding: 6,
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Done — I'm ready",
    steps: [
      {
        element: "[data-tour='panic']",
        popover: {
          title: "Your panic button",
          description: "Press, hold, release. Your circle gets your live location instantly, the alarm sounds, and once it fires only YOUR PIN can silence it. If someone forces you to stop it, use the duress PIN instead — the sound stops but help is silently called.",
        },
      },
      {
        element: "[data-tour='start']",
        popover: {
          title: "Start every date here",
          description: "Set who you're meeting and for how long, then check in. If you don't check out in time, Guardian alerts your circle automatically — silence escalates, even if your phone dies.",
        },
      },
      {
        element: "[data-tour='circle']",
        popover: {
          title: "Your safety circle",
          description: "The 2–3 people you'd want a 3 AM alert to reach. They get a private watch link — no app, no account — and can confirm they're responding, so you know a human has seen it.",
        },
      },
      {
        element: "[data-tour='clients']",
        popover: {
          title: "Screen before you meet",
          description: "The client log lives only on this phone. Log who you're meeting, run the 6-point screening checklist, and check numbers for burner/VoIP hints before you're in the room with them.",
        },
      },
      {
        element: "[data-tour='fakecall']",
        popover: {
          title: "Your graceful exit",
          description: "Schedule a fake rescue call — a burst pipe at home that needs you NOW. It rings like a real call from someone you choose, so you can leave any situation without a scene.",
        },
      },
    ],
    onDestroyed: () => {
      try { localStorage.setItem(K, "1"); } catch { /* noop */ }
    },
  });
  d.drive();
}
