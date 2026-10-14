use tauri::{AppHandle, Manager};

pub fn initialize(app: &AppHandle) -> tauri::Result<()> {
    initialize_window(app, "main")
}

pub fn initialize_window(app: &AppHandle, label: &str) -> tauri::Result<()> {
    #[cfg(windows)]
    if let Some(window) = app.get_webview_window(label) {
        let handle = app.clone();
        let label = label.to_string();
        window.with_webview(move |webview| {
            use tauri::Emitter;
            use webview2_com::{
                ContextMenuRequestedEventHandler,
                Microsoft::Web::WebView2::Win32::{
                    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND, ICoreWebView2_11,
                },
            };
            use windows::Win32::System::Com::CoTaskMemFree;
            use windows::core::{Interface, PWSTR};
            let install = || -> windows::core::Result<()> {
                unsafe {
                    let core: ICoreWebView2_11 = webview.controller().CoreWebView2()?.cast()?;
                    let handler =
                        ContextMenuRequestedEventHandler::create(Box::new(move |_, args| {
                            let Some(args) = args else {
                                return Ok(());
                            };
                            let items = args.MenuItems()?;
                            let mut count = 0;
                            items.Count(&mut count)?;
                            let mut spelling = false;
                            let mut unrelated_items = Vec::new();
                            for index in 0..count {
                                let item = items.GetValueAtIndex(index)?;
                                let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND;
                                item.Kind(&mut kind)?;
                                if kind != COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND {
                                    unrelated_items.push(index);
                                    continue;
                                }
                                let mut name = PWSTR::null();
                                item.Name(&mut name)?;
                                let text =
                                    name.to_string().unwrap_or_default().to_ascii_lowercase();
                                CoTaskMemFree(Some(name.0.cast()));
                                if text.starts_with("spellcheck")
                                    || text == "addtodictionary"
                                    || text == "ignorespelling"
                                {
                                    spelling = true;
                                } else {
                                    unrelated_items.push(index);
                                }
                            }
                            // Let WebView2 apply spelling corrections itself, including
                            // its own caret, undo history, and input events.
                            if spelling {
                                // Preserve the original spelling commands so native
                                // correction still works; remove other commands and
                                // separators in reverse order to keep indices valid.
                                for index in unrelated_items.into_iter().rev() {
                                    items.RemoveValueAtIndex(index)?;
                                }
                            } else {
                                args.SetHandled(true)?;
                                let _ = handle.emit_to(&label, "scribe:editable-context-menu", ());
                            }
                            Ok(())
                        }));
                    let mut token = 0;
                    core.add_ContextMenuRequested(&handler, &mut token)?;
                }
                Ok(())
            };
            if let Err(error) = install() {
                log::warn!("Native spelling menu integration unavailable: {error}");
            }
        })?;
    }
    Ok(())
}
