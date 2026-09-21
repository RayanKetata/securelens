import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import "./index.css";
import App from "./App.jsx";

import { SystemsProvider } from "./context/SystemsContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <SystemsProvider>
        <App />
      </SystemsProvider>
    </BrowserRouter>
  </StrictMode>
);