use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartManagerExt};
mod desktop_notifications;
mod spelling_context_menu;
mod quick_capture;
mod security;

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
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            set_autostart_enabled,
            get_autostart_enabled,
            get_device_info,
            quick_capture::set_capture_shortcut,
            quick_capture::set_capture_enabled,
            quick_capture::pause_capture_shortcut,
            quick_capture::set_capture_account,
            quick_capture::get_capture_account,
            quick_capture::capture_saved,
            quick_capture::finish_capture,
            quick_capture::open_capture_main,
            desktop_notifications::configure_desktop_notifications,
            desktop_notifications::show_desktop_notification,
            desktop_notifications::get_in_app_notifications,
            desktop_notifications::dismiss_in_app_notification
        ])
        .setup(|app| {
            spelling_context_menu::initialize(app.handle())?;
            desktop_notifications::initialize(app.handle())?;
            quick_capture::initialize(app.handle())?;
            spelling_context_menu::initialize_window(app.handle(), "quick-capture")?;
            #[cfg(all(debug_assertions, windows))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let show_item = MenuItem::with_id(app, "show", "Show Scribe", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Scribe", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let tray = TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .expect("default app icon is configured")
                        .clone(),
                )
                .tooltip("Scribe")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
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
                        }
                    }
                })
                .build(app)?;
            let _tray_icon = tray;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
