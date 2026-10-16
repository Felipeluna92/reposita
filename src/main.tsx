import React from "react";
import { createRoot } from "react-dom/client";
import App, { AppBoundary } from "./App";
import "./index.css";
import "./professional.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </React.StrictMode>,
);
