use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
mod desktop_notifications;
mod spelling_context_menu;
mod quick_capture;
mod security;
mod data_export;
mod app_updates;

pub(crate) const APP_NAME: &str = if cfg!(debug_assertions) { "Scribe Dev" } else { "Scribe" };
pub(crate) const APP_SCHEME: &str = if cfg!(debug_assertions) { "com.scribe.notes.dev" } else { "com.scribe.notes" };

#[derive(serde::Serialize)]
struct DeviceInfo {
    name: String,
    platform: String,
}

#[tauri::command]
fn get_device_info(window: tauri::WebviewWindow) -> Result<DeviceInfo, String> {
    security::require_main(&window)?;
    let platform = match std::env::consts::OS {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        other => other,
    };
    let name = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Scribe desktop".to_string());
    Ok(DeviceInfo { name, platform: platform.to_string() })
}

#[tauri::command]
fn set_autostart_enabled(app: AppHandle, window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    security::require_main(&window)?;
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|error| error.to_string())
}

#[tauri::command]
fn get_autostart_enabled(app: AppHandle, window: tauri::WebviewWindow) -> Result<bool, String> {
    security::require_main(&window)?;
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    // Set the runtime allowlist before either deep-link plugin initializes.
    // Installer metadata continues to register only the production scheme.
    context.config_mut().plugins.0.insert("deep-link".into(), serde_json::json!({
        "desktop": { "schemes": [APP_SCHEME] }
    }));
    let autostart = tauri_plugin_autostart::Builder::new().app_name(APP_NAME);
    #[cfg(target_os = "macos")]
    let autostart = autostart.macos_launcher(tauri_plugin_autostart::MacosLauncher::LaunchAgent);
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
                let _ = app.emit_to("main", "scribe:check-for-updates", true);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(autostart.build())
        .invoke_handler(tauri::generate_handler![
            set_autostart_enabled,
            get_autostart_enabled,
            get_device_info,
            app_updates::updater_configured,
            app_updates::check_app_update,
            app_updates::set_update_check_schedule,
            app_updates::prepare_app_update,
            app_updates::finish_app_update,
            data_export::save_export_file,
            quick_capture::set_capture_shortcut,
            quick_capture::set_capture_enabled,
            quick_capture::pause_capture_shortcut,
            quick_capture::set_capture_account,
            quick_capture::prepare_workspace_data_reset,
            quick_capture::restart_after_data_reset,
            quick_capture::get_capture_account,
            quick_capture::capture_saved,
            quick_capture::finish_capture,
            quick_capture::open_capture_main,
            desktop_notifications::configure_desktop_notifications,
            desktop_notifications::show_desktop_notification,
            desktop_notifications::show_update_notification,
            desktop_notifications::get_in_app_notifications,
            desktop_notifications::dismiss_in_app_notification,
            desktop_notifications::clear_workspace_notifications
        ])
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                main.set_title(APP_NAME)?;
            }
            quick_capture::initialize(app.handle())?;
            spelling_context_menu::initialize(app.handle())?;
            desktop_notifications::initialize(app.handle())?;
            app_updates::initialize_schedule(app.handle())?;
            #[cfg(windows)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // Reopening production repairs a scheme claimed by older dev builds.
                // Dev now registers only its own scheme.
                app.deep_link().register(APP_SCHEME)?;
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let show_item = MenuItem::with_id(app, "show", format!("Show {APP_NAME}"), true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", format!("Quit {APP_NAME}"), true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let tray = TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .expect("default app icon is configured")
                        .clone(),
                )
                .tooltip(APP_NAME)
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = app.emit_to("main", "scribe:check-for-updates", true);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = tray.app_handle().emit_to("main", "scribe:check-for-updates", true);
                        }
                    }
                })
                .build(app)?;
            let _tray_icon = tray;
            Ok(())
        })
        .run(context)
        .expect("error while building tauri application");
}
