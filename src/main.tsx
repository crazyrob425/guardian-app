import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import i18n from "./lib/i18n";
import { store } from "./lib/store";

// Apply the saved language before first paint (Phase 4).
try {
  const lang = store.getSettings().language;
  if (lang && lang !== "en") void i18n.changeLanguage(lang);
} catch { /* English default */ }

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
