import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Bundled locally: no request leaves the machine for fonts.
// Inter Tight carries the interface; Fraunces carries the display headings.
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/fraunces";
import App from "./App";
import { applyTheme, readTheme } from "./lib/prefs";
import "./styles.css";

// The inline script in index.html already set the attribute before paint; this
// keeps the document in sync if that script was blocked.
applyTheme(readTheme());

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
