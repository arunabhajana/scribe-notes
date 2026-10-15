import { invoke, isTauri } from "@tauri-apps/api/core";
export async function saveExport(userId: string, bytes: Uint8Array, format: "backup" | "markdown"): Promise<"saved" | "download-started" | "cancelled"> {
  const filename = `scribe-notes-${new Date().toISOString().slice(0, 10)}.${format === "backup" ? "scribe" : "zip"}`;
  if (isTauri()) {
    try {
      const saved = await invoke<boolean>("save_export_file", bytes, { headers: { "x-scribe-workspace": userId, "x-scribe-filename": filename } });
      return saved ? "saved" : "cancelled";
    } catch (cause) { if (cause !== "native_save_not_supported") throw cause; }
  }
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: format === "backup" ? "application/json" : "application/zip" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "download-started";
}
