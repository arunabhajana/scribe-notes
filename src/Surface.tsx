import { lazy } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AutoRevealValidation } from "./components/layout/AutoRevealValidation";

const capture = isTauri() && getCurrentWindow().label === "quick-capture";
// Capture does not start another authentication or cloud sync client.
const Content = capture ? lazy(() => import("./features/capture/QuickCapture")) : lazy(() => import("./App"));

export default function Surface() {
  return <><Content />{!capture && <AutoRevealValidation />}</>;
}
