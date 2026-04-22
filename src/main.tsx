import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { registerSW } from "./lib/swRegistration";

// Apply initial theme before React renders to avoid flash
const savedTheme = localStorage.getItem("app-theme") || "dark";
const html = document.documentElement;
html.classList.toggle("dark", savedTheme === "dark" || savedTheme === "ben");
html.setAttribute("data-theme", savedTheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register service worker
registerSW(() => {
  // New version available — dispatch event for UpdateBanner component
  window.dispatchEvent(new CustomEvent("sw-update-available"));
});
