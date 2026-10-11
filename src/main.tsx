import { ContextMenuProvider } from "./components/context-menu/ContextMenu";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ContextMenuProvider><App /></ContextMenuProvider>
  </StrictMode>,
);
