use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Clone, serde::Deserialize, PartialEq)]
pub struct Binding {
    key: String,
    shift: bool,
}

pub struct CaptureState {
    user_id: Mutex<Option<String>>,
    return_to_main: Mutex<bool>,
    #[cfg(windows)]
    worker: Mutex<Option<(std::sync::mpsc::Sender<Request>, u32)>>,
}
#[cfg(windows)]
struct Request {
    binding: Option<Binding>,
    paused: Option<bool>,
    reply: std::sync::mpsc::Sender<Result<(), String>>,
}

pub fn initialize(app: &AppHandle) -> tauri::Result<()> {
    app.manage(CaptureState {
        user_id: Mutex::new(None),
        return_to_main: Mutex::new(false),
        #[cfg(windows)]
        worker: Mutex::new(None),
    });
    let window =
        WebviewWindowBuilder::new(app, "quick-capture", WebviewUrl::App("index.html".into()))
            .title("Quick capture · Scribe")
            .inner_size(560.0, 350.0)
            .resizable(false)
            .decorations(false)
            .transparent(false)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .center()
            .build()?;
    window.set_decorations(false)?;
    if let Some(main) = app.get_webview_window("main") {
        let app = app.clone();
        main.on_window_event(move |event| {
            // The hidden capture window must not keep a normally closed app
            // alive. Closing to the tray never destroys the main window.
            if matches!(event, tauri::WindowEvent::Destroyed) {
                app.exit(0);
            }
        });
    }
    let handle = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.hide();
        }
    });
    #[cfg(windows)]
    {
        use windows::Win32::{
            System::Threading::GetCurrentThreadId,
            UI::{
                Input::KeyboardAndMouse::{
                    MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, RegisterHotKey, UnregisterHotKey,
                    VkKeyScanW,
                },
                WindowsAndMessaging::{GetMessageW, MSG, PM_NOREMOVE, PeekMessageW, WM_HOTKEY},
            },
        };
        let (sender, receiver) = std::sync::mpsc::channel::<Request>();
        let (ready_sender, ready_receiver) = std::sync::mpsc::channel();
        let handle = app.clone();
        std::thread::spawn(move || unsafe {
            let mut message = MSG::default();
            let _ = PeekMessageW(&mut message, None, 0, 0, PM_NOREMOVE);
            let _ = ready_sender.send(GetCurrentThreadId());
            let mut current: Option<(
                Binding,
                i32,
                windows::Win32::UI::Input::KeyboardAndMouse::HOT_KEY_MODIFIERS,
                u32,
            )> = None;
            let mut paused = false;
            while GetMessageW(&mut message, None, 0, 0).0 > 0 {
                if message.message == WM_HOTKEY {
                    let app = handle.clone();
                    let _ = handle.run_on_main_thread(move || show(&app));
                }
                while let Ok(request) = receiver.try_recv() {
                    if let Some(value) = request.paused {
                        let result = if value == paused {
                            Ok(())
                        } else if value {
                            if let Some((_, id, _, _)) = &current {
                                let _ = UnregisterHotKey(None, *id);
                            }
                            paused = true;
                            Ok(())
                        } else {
                            let result = current
                                .as_ref()
                                .map(|(_, id, modifiers, vk)| {
                                    RegisterHotKey(None, *id, *modifiers, *vk)
                                })
                                .unwrap_or(Ok(()));
                            if result.is_ok() {
                                paused = false;
                            }
                            result.map_err(|_| "Quick capture could not restore its global shortcut. Choose another in Settings.".to_string())
                        };
                        let _ = request.reply.send(result);
                        continue;
                    }
                    let Some(binding) = request.binding else {
                        continue;
                    };
                    if current
                        .as_ref()
                        .is_some_and(|(previous, _, _, _)| previous == &binding)
                    {
                        let _ = request.reply.send(Ok(()));
                        continue;
                    }
                    let mut characters = binding.key.chars();
                    let character = characters.next();
                    let scan = character
                        .filter(|c| c.is_ascii() && characters.next().is_none())
                        .map(|c| VkKeyScanW(c as u16))
                        .unwrap_or(-1);
                    let result = if scan == -1 || (scan as u16 >> 8) & 6 != 0 {
                        Err("Choose a letter, number, Space or punctuation key with Ctrl and optional Shift.".into())
                    } else {
                        let modifiers = MOD_CONTROL
                            | MOD_NOREPEAT
                            | if binding.shift || (scan as u16 >> 8) & 1 != 0 {
                                MOD_SHIFT
                            } else {
                                windows::Win32::UI::Input::KeyboardAndMouse::HOT_KEY_MODIFIERS(0)
                            };
                        let id = if current.as_ref().is_some_and(|(_, id, _, _)| *id == 1) {
                            2
                        } else {
                            1
                        };
                        let vk = (scan as u16 & 255) as u32;
                        match RegisterHotKey(None, id, modifiers, vk) {
                            Ok(()) => {
                                if !paused { if let Some((_, previous, _, _)) = &current { let _ = UnregisterHotKey(None, *previous); } }
                                if paused { let _ = UnregisterHotKey(None, id); }
                                current = Some((binding, id, modifiers, vk)); Ok(())
                            }
                            Err(_) => Err("That global shortcut is unavailable or used by another app. Choose a different shortcut.".into()),
                        }
                    };
                    let _ = request.reply.send(result);
                }
            }
            if let Some((_, id, _, _)) = current {
                let _ = UnregisterHotKey(None, id);
            }
        });
        let thread = ready_receiver
            .recv()
            .map_err(|_| std::io::Error::other("Could not initialize global capture."))?;
        *app.state::<CaptureState>().worker.lock().unwrap() = Some((sender, thread));
    }
    Ok(())
}

// A capture window never restores or changes the main window's state.
fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("quick-capture") {
        if !window.is_focused().unwrap_or(false) {
            let focused = app.get_webview_window("main").is_some_and(|main| {
                main.is_visible().unwrap_or(false)
                    && !main.is_minimized().unwrap_or(true)
                    && main.is_focused().unwrap_or(false)
            });
            if let Ok(mut value) = app.state::<CaptureState>().return_to_main.lock() {
                *value = focused;
            }
        }
        let positioned = app
            .cursor_position()
            .ok()
            .and_then(|cursor| app.monitor_from_point(cursor.x, cursor.y).ok().flatten())
            .map(|monitor| {
                let position = monitor.position();
                let size = monitor.size();
                let scale = monitor.scale_factor();
                window.set_position(tauri::PhysicalPosition::new(
                    position.x + ((size.width as f64 - 560.0 * scale) / 2.0) as i32,
                    position.y + ((size.height as f64 - 350.0 * scale) / 2.0) as i32,
                ))
            });
        if positioned.is_none() {
            let _ = window.center();
        }
        let _ = window.emit("scribe:capture-open", ());
        let _ = window.set_decorations(false);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn finish_capture(app: AppHandle, window: tauri::WebviewWindow) -> Result<bool, String> {
    if window.label() != "quick-capture" {
        return Err("Invalid capture window.".into());
    }
    window.hide().map_err(|error| error.to_string())?;
    let restore = *app
        .state::<CaptureState>()
        .return_to_main
        .lock()
        .map_err(|_| "Could not finish capture.")?;
    if let Some(main) = app.get_webview_window("main") {
        if restore
            && main.is_visible().unwrap_or(false)
            && !main.is_minimized().unwrap_or(true)
            && main.set_focus().is_ok()
        {
            return Ok(true);
        }
        return Ok(main.is_focused().unwrap_or(false)
            && main.is_visible().unwrap_or(false)
            && !main.is_minimized().unwrap_or(true));
    }
    Ok(false)
}

#[tauri::command]
pub async fn set_capture_shortcut(
    app: AppHandle,
    window: tauri::WebviewWindow,
    binding: Binding,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("This action is only available in Scribe settings.".into());
    }
    update_shortcut(app, Some(binding), None).await
}

#[tauri::command]
pub async fn pause_capture_shortcut(
    app: AppHandle,
    window: tauri::WebviewWindow,
    paused: bool,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("This action is only available in Scribe settings.".into());
    }
    update_shortcut(app, None, Some(paused)).await
}

async fn update_shortcut(
    app: AppHandle,
    binding: Option<Binding>,
    paused: Option<bool>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::{
            Foundation::{LPARAM, WPARAM},
            UI::WindowsAndMessaging::PostThreadMessageW,
        };
        let (reply, receiver) = std::sync::mpsc::channel();
        {
            let state = app.state::<CaptureState>();
            let worker = state
                .worker
                .lock()
                .map_err(|_| "Could not update the shortcut.")?;
            let (sender, thread) = worker.as_ref().ok_or("Global capture is not ready.")?;
            sender
                .send(Request {
                    binding,
                    paused,
                    reply,
                })
                .map_err(|_| "Global capture is not available.")?;
            unsafe { PostThreadMessageW(*thread, 0x8001, WPARAM(0), LPARAM(0)) }
                .map_err(|_| "Could not update the shortcut.")?;
        }
        return tauri::async_runtime::spawn_blocking(move || {
            receiver
                .recv_timeout(std::time::Duration::from_secs(3))
                .map_err(|_| "Could not register the shortcut. Try again.".to_string())?
        })
        .await
        .map_err(|error| error.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = (app, binding, paused);
        Err("Global capture is currently available on Windows.".into())
    }
}

#[tauri::command]
pub fn set_capture_account(
    app: AppHandle,
    window: tauri::WebviewWindow,
    user_id: Option<String>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Account changes must come from Scribe.".into());
    }
    *app.state::<CaptureState>()
        .user_id
        .lock()
        .map_err(|_| "Could not update capture account.")? = user_id;
    if let Some(capture) = app.get_webview_window("quick-capture") {
        let _ = capture.emit("scribe:capture-account", ());
    }
    Ok(())
}

#[tauri::command]
pub fn get_capture_account(app: AppHandle) -> Option<String> {
    app.state::<CaptureState>()
        .user_id
        .lock()
        .ok()
        .and_then(|user| user.clone())
}

#[tauri::command]
pub fn capture_saved(
    app: AppHandle,
    window: tauri::WebviewWindow,
    user_id: String,
    note_id: String,
) -> Result<(), String> {
    if window.label() != "quick-capture" {
        return Err("Invalid capture window.".into());
    }
    if get_capture_account(app.clone()).as_deref() != Some(user_id.as_str()) {
        return Err("Your account changed. Open Scribe to finish saving.".into());
    }
    app.emit_to(
        "main",
        "scribe:capture-saved",
        serde_json::json!({ "userId": user_id, "noteId": note_id }),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_capture_main(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    if let Some(window) = app.get_webview_window("quick-capture") {
        let _ = window.hide();
    }
}
