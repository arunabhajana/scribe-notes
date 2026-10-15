fn main() {
    println!("cargo:rerun-if-changed=icons/scribe-v2");
    // App commands participate in Tauri ACLs instead of being available to every local webview.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "set_autostart_enabled",
            "get_autostart_enabled",
            "get_device_info",
            "save_export_file",
            "set_capture_shortcut",
            "set_capture_enabled",
            "pause_capture_shortcut",
            "set_capture_account",
            "prepare_workspace_data_reset",
            "restart_after_data_reset",
            "get_capture_account",
            "capture_saved",
            "finish_capture",
            "open_capture_main",
            "configure_desktop_notifications",
            "show_desktop_notification",
            "get_in_app_notifications",
            "dismiss_in_app_notification",
            "clear_workspace_notifications",
        ]),
    )).expect("failed to build Scribe permissions");
}
