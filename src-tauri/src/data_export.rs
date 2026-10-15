use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle,
};

#[tauri::command]
pub async fn save_export_file(
    app: AppHandle,
    window: tauri::WebviewWindow,
    request: Request<'_>,
) -> Result<bool, String> {
    crate::security::require_main(&window)?;
    let user_id = request
        .headers()
        .get("x-scribe-workspace")
        .and_then(|value| value.to_str().ok())
        .ok_or("No active workspace.")?
        .to_string();
    crate::security::require_account(&app, &user_id)?;
    let filename = request
        .headers()
        .get("x-scribe-filename")
        .and_then(|value| value.to_str().ok())
        .ok_or("Invalid export filename.")?
        .to_string();
    let extension = if filename.ends_with(".scribe") {
        "scribe"
    } else if filename.ends_with(".zip") {
        "zip"
    } else {
        return Err("Unsupported export format.".into());
    };
    if filename.len() > 100
        || !filename
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
    {
        return Err("Invalid export filename.".into());
    }
    let data = match request.body() {
        InvokeBody::Raw(bytes) if !bytes.is_empty() && bytes.len() <= 50 * 1024 * 1024 => {
            bytes.clone()
        }
        _ => return Err("Export must contain data and be smaller than 50 MB.".into()),
    };
    #[cfg(windows)]
    {
        let parent = window.hwnd().map_err(|error| error.to_string())?.0 as usize;
        tauri::async_runtime::spawn_blocking(move || {
            windows_save(app, &user_id, parent, &filename, extension, &data)
        })
        .await
        .map_err(|error| error.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (app, user_id, filename, extension, data);
        Err("native_save_not_supported".into())
    }
}

#[cfg(windows)]
fn windows_save(
    app: AppHandle,
    user_id: &str,
    parent: usize,
    filename: &str,
    extension: &str,
    data: &[u8],
) -> Result<bool, String> {
    use std::{
        fs::OpenOptions,
        io::Write,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };
    use windows::{
        core::{w, HRESULT, HSTRING},
        Win32::{
            Foundation::HWND,
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
            },
            UI::Shell::{
                Common::COMDLG_FILTERSPEC, FileSaveDialog, IFileSaveDialog, FOS_FORCEFILESYSTEM,
                FOS_NOCHANGEDIR, FOS_OVERWRITEPROMPT, FOS_PATHMUSTEXIST, FOS_STRICTFILETYPES,
                SIGDN_FILESYSPATH,
            },
        },
    };
    struct Com;
    impl Drop for Com {
        fn drop(&mut self) {
            unsafe {
                CoUninitialize();
            }
        }
    }
    let path = unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|error| error.to_string())?;
        let _com = Com;
        let dialog: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| error.to_string())?;
        let filter = if extension == "scribe" {
            COMDLG_FILTERSPEC {
                pszName: w!("Scribe backup (*.scribe)"),
                pszSpec: w!("*.scribe"),
            }
        } else {
            COMDLG_FILTERSPEC {
                pszName: w!("Markdown ZIP (*.zip)"),
                pszSpec: w!("*.zip"),
            }
        };
        dialog
            .SetFileTypes(&[filter])
            .map_err(|error| error.to_string())?;
        dialog
            .SetDefaultExtension(&HSTRING::from(extension))
            .map_err(|error| error.to_string())?;
        dialog
            .SetFileName(&HSTRING::from(filename))
            .map_err(|error| error.to_string())?;
        dialog
            .SetOptions(
                dialog.GetOptions().map_err(|error| error.to_string())?
                    | FOS_FORCEFILESYSTEM
                    | FOS_NOCHANGEDIR
                    | FOS_OVERWRITEPROMPT
                    | FOS_PATHMUSTEXIST
                    | FOS_STRICTFILETYPES,
            )
            .map_err(|error| error.to_string())?;
        if let Err(error) = dialog.Show(Some(HWND(parent as *mut _))) {
            if error.code() == HRESULT::from_win32(1223) {
                return Ok(false);
            }
            return Err(error.to_string());
        }
        let item = dialog.GetResult().map_err(|error| error.to_string())?;
        let allocated = item
            .GetDisplayName(SIGDN_FILESYSPATH)
            .map_err(|error| error.to_string())?;
        let value = allocated.to_string();
        CoTaskMemFree(Some(allocated.0.cast()));
        PathBuf::from(value.map_err(|error| error.to_string())?)
    };
    crate::security::require_account(&app, user_id)?;
    if path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case(extension))
        != Some(true)
    {
        return Err(format!("Save this export with a .{extension} extension."));
    }
    let directory = path.parent().ok_or("Choose a valid export folder.")?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let temporary = directory.join(format!(".scribe-export-{}-{stamp}.tmp", std::process::id()));
    // Write beside the target, then rename. A failed write must not truncate a
    // previously saved backup. Only our own create_new temporary file is removed.
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|_| "Could not create the export. Check folder permissions and free space.")?;
    let written = file.write_all(data).and_then(|_| file.sync_all());
    drop(file);
    if written.is_err() {
        let _ = std::fs::remove_file(&temporary);
        return Err("Could not finish writing the export. The previous file has been kept.".into());
    }
    if std::fs::rename(&temporary, &path).is_err() {
        let _ = std::fs::remove_file(&temporary);
        return Err("Could not save the export at that location. Close the existing file or choose another folder.".into());
    }
    Ok(true)
}
