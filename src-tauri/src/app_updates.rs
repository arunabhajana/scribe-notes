use tauri::{AppHandle, WebviewWindow};

#[tauri::command]
pub fn updater_configured(app: AppHandle, window: WebviewWindow) -> Result<bool, String> {
    crate::security::require_main(&window)?;
    Ok(!cfg!(debug_assertions)
        && app.config().plugins.0.get("updater")
            .and_then(|config| config.get("pubkey"))
            .and_then(|key| key.as_str())
            .is_some_and(|key| !key.trim().is_empty()))
}

#[tauri::command]
pub fn prepare_app_update(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    crate::security::require_main(&window)?;
    crate::quick_capture::block_for_update(&app)
}

#[tauri::command]
pub fn finish_app_update(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    crate::security::require_main(&window)?;
    crate::quick_capture::unblock_after_update(&app);
    Ok(())
}
