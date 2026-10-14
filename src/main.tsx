import { ContextMenuProvider } from "./components/context-menu/ContextMenu";
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Surface from "./Surface";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}><ContextMenuProvider><Surface /></ContextMenuProvider></Suspense>
  </StrictMode>,
);
