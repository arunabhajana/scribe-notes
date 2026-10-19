use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use std::sync::{Arc, Condvar, Mutex};
use tauri_plugin_updater::UpdaterExt;

const CHECK_TIMEOUT_MS: u64 = 60_000;
const AUTOMATIC_CHECK_INTERVAL: Duration = Duration::from_secs(30 * 60);

pub struct UpdateSchedule(Arc<(Mutex<Option<Instant>>, Condvar)>);

// Windows can throttle timers in a hidden WebView. Keep the deadline in the
// native process; only the main window may arm it after checking consent.
#[tauri::command]
pub fn set_update_check_schedule(window: WebviewWindow, enabled: bool, schedule: State<'_, UpdateSchedule>) -> Result<(), String> {
    crate::security::require_main(&window)?;
    let (deadline, wake) = &*schedule.0;
    *deadline.lock().map_err(|_| "Update scheduling is unavailable")? = enabled.then(|| Instant::now() + AUTOMATIC_CHECK_INTERVAL);
    wake.notify_one();
    Ok(())
}

pub fn initialize_schedule(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let schedule = Arc::new((Mutex::new(None::<Instant>), Condvar::new()));
    app.manage(UpdateSchedule(schedule.clone()));
    let handle = app.clone();
    std::thread::Builder::new().name("scribe-update-schedule".into()).spawn(move || {
        let (deadline, wake) = &*schedule;
        loop {
            let Ok(mut next) = deadline.lock() else { break; };
            while next.is_none() {
                let Ok(guard) = wake.wait(next) else { return; };
                next = guard;
            }
            let remaining = next.unwrap().saturating_duration_since(Instant::now());
            if !remaining.is_zero() {
                let Ok((guard, _)) = wake.wait_timeout(next, remaining) else { return; };
                drop(guard);
                continue;
            }
            // Retain a fallback deadline if the WebView is temporarily paused.
            *next = Some(Instant::now() + AUTOMATIC_CHECK_INTERVAL);
            drop(next);
            let _ = handle.emit_to("main", "scribe:check-for-updates", false);
        }
    })?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    rid: tauri::ResourceId,
    current_version: String,
    version: String,
    body: Option<String>,
    date: Option<String>,
    raw_json: serde_json::Value,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckError {
    message: String,
    diagnostic: UpdateDiagnostic,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateDiagnostic {
    stage: &'static str,
    category: &'static str,
    native_error: String,
    causes: Vec<String>,
    elapsed_ms: u64,
    timeout_ms: u64,
    endpoints: Vec<String>,
}

fn check_error(
    app: &AppHandle,
    started: Instant,
    stage: &'static str,
    category: &'static str,
    error: &(dyn std::error::Error + 'static),
) -> UpdateCheckError {
    let message = error.to_string();
    let mut causes = Vec::new();
    let mut source = error.source();
    while let Some(cause) = source {
        causes.push(cause.to_string().chars().take(500).collect());
        if causes.len() == 5 { break; }
        source = cause.source();
    }
    let endpoints = app.config().plugins.0.get("updater")
        .and_then(|config| config.get("endpoints"))
        .and_then(serde_json::Value::as_array)
        .map(|values| values.iter().filter_map(serde_json::Value::as_str).take(3)
            .map(|value| value.chars().take(1000).collect()).collect())
        .unwrap_or_default();
    UpdateCheckError {
        message: message.chars().take(1000).collect(),
        diagnostic: UpdateDiagnostic {
            stage, category, native_error: message.chars().take(1000).collect(), causes,
            elapsed_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
            timeout_ms: CHECK_TIMEOUT_MS, endpoints,
        },
    }
}

// Keep the original error sources: the plugin's JS command reduces errors to
// their top-level message, hiding whether a request timed out or failed TLS/DNS.
// Download, signature verification and installation still use the plugin's Update.
#[tauri::command]
pub async fn check_app_update(app: AppHandle, window: WebviewWindow) -> Result<Option<UpdateMetadata>, UpdateCheckError> {
    let started = Instant::now();
    crate::security::require_main(&window).map_err(|message| check_error(
        &app, started, "permission", "permission", &std::io::Error::other(message),
    ))?;
    if !updater_configured(app.clone(), window.clone()).unwrap_or(false) {
        return Err(check_error(&app, started, "configuration", "configuration",
            &std::io::Error::other("Updates are not configured in this build.")));
    }
    let updater = app.updater_builder().timeout(Duration::from_millis(CHECK_TIMEOUT_MS))
        .build().map_err(|error| check_error(&app, started, "configuration", "configuration", &error))?;
    let update = updater.check().await.map_err(|error| {
        let category = match &error {
            tauri_plugin_updater::Error::Reqwest(request) if request.is_timeout() => "timeout",
            tauri_plugin_updater::Error::Reqwest(request) if request.is_connect() => "connection",
            tauri_plugin_updater::Error::Reqwest(request) if request.is_decode() => "response",
            tauri_plugin_updater::Error::Reqwest(_) => "network",
            tauri_plugin_updater::Error::Serialization(_) | tauri_plugin_updater::Error::Semver(_) => "manifest",
            tauri_plugin_updater::Error::ReleaseNotFound => "unavailable",
            tauri_plugin_updater::Error::TargetNotFound(_) | tauri_plugin_updater::Error::TargetsNotFound(_) => "platform",
            _ => "unknown",
        };
        check_error(&app, started, "check", category, &error)
    })?;
    Ok(update.map(|update| UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(), body: update.body.clone(),
        date: update.raw_json.get("pub_date").and_then(serde_json::Value::as_str).map(str::to_owned),
        raw_json: update.raw_json.clone(),
        rid: window.resources_table().add(update),
    }))
}

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
