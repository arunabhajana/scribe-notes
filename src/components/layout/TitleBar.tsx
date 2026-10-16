import { useEffect, useState } from "react";
import { appName } from "../../features/appIdentity";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWritingPreferences } from "../../features/settings/writingPreferences";
import {
  Minimize2,
  Minus,
  Moon,
  Settings2,
  Square,
  Sun,
  X,
  Wifi,
  WifiOff,
} from "lucide-react";

export function TitleBar({
  onOpenSettings,
  dark = true,
  onToggleTheme,
  inert,
  settingsShortcut,
  syncStatus,
  offlineMode = false,
  onToggleOfflineMode,
}: {
  onOpenSettings?: () => void;
  dark?: boolean;
  onToggleTheme?: () => void;
  inert?: boolean;
  settingsShortcut?: string;
  syncStatus?: "on-device" | "syncing" | "synced" | "offline" | "error";
  offlineMode?: boolean;
  onToggleOfflineMode?: () => void;
}) {
  const [maximized, setMaximized] = useState(false);
  const [writingPreferences] = useWritingPreferences();
  const desktop = isTauri();

  useEffect(() => {
    if (!desktop || !writingPreferences.minimizeToTray) return;
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void appWindow.onCloseRequested((event) => {
      if (disposed) return;
      event.preventDefault();
      void appWindow.hide();
    }).then((handler) => {
      if (disposed) handler();
      else unlisten = handler;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop, writingPreferences.minimizeToTray]);

  useEffect(() => {
    if (!desktop) return;
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void appWindow.isMaximized().then(setMaximized);
    void appWindow
      .onResized(() => {
        void appWindow.isMaximized().then(setMaximized);
      })
      .then((handler) => {
        unlisten = handler;
      });
    return () => unlisten?.();
  }, [desktop]);

  const toggleMaximize = () => {
    if (!desktop) return;
    void getCurrentWindow().toggleMaximize();
  };

  const startWindowDrag = (event: React.MouseEvent<HTMLElement>) => {
    if (!desktop || inert || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().startDragging();
  };

  return (
    <header
      className={`titlebar ${dark ? "titlebar-dark" : "titlebar-light"}`}
      data-tauri-drag-region
      onMouseDown={startWindowDrag}
      onDoubleClick={toggleMaximize}
      inert={inert}
    >
      {syncStatus === "syncing" && <span className="titlebar-loading-bar" aria-hidden="true" />}
      <div className="titlebar-leading" data-tauri-drag-region>
        {syncStatus && <>
        <span className={`titlebar-status-dot status-${syncStatus}`} />
        <span
          key={syncStatus}
          className={`titlebar-sync-label status-${syncStatus}`}
        >
          {syncStatus === "syncing"
            ? "Syncing…"
            : syncStatus === "synced"
              ? "Synced"
              : syncStatus === "offline"
                ? "Offline"
                : syncStatus === "error"
                  ? "Sync issue"
                  : "On this device"}
        </span>
        </>}
      </div>
      <div className="titlebar-title" data-tauri-drag-region>
        {appName}
      </div>
      <div className="titlebar-trailing">
        {onToggleOfflineMode && (
          <button
            className={`titlebar-action offline-mode-toggle ${offlineMode ? "is-offline" : ""}`}
            onClick={onToggleOfflineMode}
            aria-label={
              offlineMode ? "Enable cloud sync" : "Turn off cloud sync"
            }
            aria-pressed={!offlineMode}
            data-tooltip={
              offlineMode
                ? "Cloud sync is off · Changes stay on this device"
                : "Cloud sync is on · Changes sync to your account"
            }
          >
            {offlineMode ? <WifiOff size={14} /> : <Wifi size={14} />}
          </button>
        )}
        {onToggleTheme && (
          <button
            className="titlebar-action theme-titlebar-action"
            onClick={onToggleTheme}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            data-tooltip={dark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        )}
        {onOpenSettings && (
          <button
            className="titlebar-action"
            onClick={onOpenSettings}
            aria-label="Open settings"
            data-tooltip={`Settings${settingsShortcut ? ` · ${settingsShortcut}` : ""}`}
          >
            <Settings2 size={14} />
          </button>
        )}
        {desktop && (
          <div className="window-action-group">
            <button
              className="window-action"
              aria-label="Minimize"
              title="Minimize"
              onClick={() => void getCurrentWindow().minimize()}
            >
              <Minus size={14} />
            </button>
            <button
              className="window-action"
              aria-label={maximized ? "Restore" : "Maximize"}
              title={maximized ? "Restore" : "Maximize"}
              onClick={toggleMaximize}
            >
              {maximized ? <Minimize2 size={12} /> : <Square size={11} />}
            </button>
            <button
              className="window-action close-window-action"
              aria-label="Close"
              title="Close"
              onClick={() => void getCurrentWindow().close()}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
