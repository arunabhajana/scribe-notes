use tauri::{AppHandle, WebviewWindow};

pub fn require_main(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" { return Err("This action is only available in the main Scribe window.".into()); }
    Ok(())
}

pub fn require_account(app: &AppHandle, user_id: &str) -> Result<(), String> {
    if crate::quick_capture::active_account(app).as_deref() != Some(user_id) {
        return Err("This action does not belong to your active account.".into());
    }
    Ok(())
}
