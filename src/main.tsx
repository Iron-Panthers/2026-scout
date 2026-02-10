import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { registerSW } from "./lib/swRegistration";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="dark">
      <App />
    </div>
  </StrictMode>
);

// Register service worker
registerSW(() => {
  // New version available — dispatch event for UpdateBanner component
  window.dispatchEvent(new CustomEvent("sw-update-available"));
});
