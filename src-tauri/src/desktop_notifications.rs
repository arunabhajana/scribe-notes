use std::sync::mpsc::{self, Sender};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderPlan {
    note_id: String,
    title: String,
    due_at: i64,
    updated_at: i64,
    lead_minutes: u32,
}

#[derive(Clone, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NotificationConfig {
    user_id: Option<String>,
    enabled: bool,
    reminders_enabled: bool,
    sound: bool,
    reminders: Vec<ReminderPlan>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NotificationKind {
    QuickCapture,
    SyncError,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationMessage {
    kind: NotificationKind,
    user_id: String,
}

enum Work {
    Configure(NotificationConfig),
    Show(NotificationMessage),
    #[cfg(windows)]
    Failed {
        tag: String,
        submitted: i64,
        error: String,
    },
}
pub struct NotificationService(Sender<Work>);

#[tauri::command]
pub fn configure_desktop_notifications(
    config: NotificationConfig,
    service: State<'_, NotificationService>,
) -> Result<(), String> {
    #[cfg(windows)]
    if config
        .user_id
        .as_ref()
        .is_some_and(|id| uuid::Uuid::parse_str(id).is_err())
    {
        return Err("Invalid notification account.".into());
    }
    service
        .0
        .send(Work::Configure(config))
        .map_err(|_| "Desktop notifications are unavailable. Restart Scribe.".to_string())
}

#[tauri::command]
pub fn show_desktop_notification(
    message: NotificationMessage,
    service: State<'_, NotificationService>,
) -> Result<(), String> {
    #[cfg(windows)]
    if uuid::Uuid::parse_str(&message.user_id).is_err() {
        return Err("Invalid notification account.".into());
    }
    service
        .0
        .send(Work::Show(message))
        .map_err(|_| "Desktop notifications are unavailable. Restart Scribe.".to_string())
}

pub fn initialize(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let (sender, receiver) = mpsc::channel();
    app.manage(NotificationService(sender.clone()));
    #[cfg(windows)]
    {
        let directory = app.path().app_local_data_dir()?.join("notifications");
        let handle = app.clone();
        std::thread::Builder::new()
            .name("scribe-notifications".into())
            .spawn(move || windows_impl::run(receiver, sender, directory, handle))?;
    }
    #[cfg(not(windows))]
    std::thread::spawn(move || while receiver.recv().is_ok() {});
    Ok(())
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::{
        collections::{HashMap, hash_map::DefaultHasher},
        hash::{Hash, Hasher},
        path::PathBuf,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };
    use windows::{
        Data::Xml::Dom::XmlDocument,
        Foundation::TypedEventHandler,
        UI::Notifications::{
            NotificationSetting, ToastFailedEventArgs, ToastNotification, ToastNotificationManager,
        },
        Win32::{
            Foundation::PROPERTYKEY,
            System::Com::{
                CLSCTX_INPROC_SERVER, CoCreateInstance, IPersistFile,
                StructuredStorage::{
                    InitPropVariantFromCLSID, PROPVARIANT, PVCHF_DEFAULT, PropVariantChangeType,
                },
            },
            System::Variant::VT_LPWSTR,
            System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize},
            UI::Shell::{
                IShellLinkW, PropertiesSystem::IPropertyStore, SHCNE_CREATE, SHCNF_PATHW,
                SHChangeNotify, ShellLink,
            },
        },
        core::{GUID, HSTRING, Interface, PCWSTR},
    };
    use winreg::{
        RegKey, RegValue,
        enums::{HKEY_CURRENT_USER, REG_EXPAND_SZ},
    };
    const APP_ID: &str = "com.scribe.notes.notifications";
    const ACTIVATOR: GUID = GUID::from_u128(0x1e35c979_784d_4a2e_991b_2e4c8e6d71c0);
    const PROPERTY_ID: PROPERTYKEY = PROPERTYKEY {
        fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
        pid: 5,
    };
    const PROPERTY_ACTIVATOR: PROPERTYKEY = PROPERTYKEY {
        fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
        pid: 26,
    };
    fn now() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }
    fn registry_text(key: &RegKey, name: &str, value: &str) -> Result<(), String> {
        let bytes = value
            .encode_utf16()
            .chain(Some(0))
            .flat_map(u16::to_le_bytes)
            .collect();
        key.set_raw_value(
            name,
            &RegValue {
                bytes,
                vtype: REG_EXPAND_SZ,
            },
        )
        .map_err(|error| error.to_string())
    }
    fn xml(value: &str) -> String {
        value
            .chars()
            .filter(|c| *c == '\n' || *c == '\t' || *c == '\r' || *c >= ' ')
            .take(500)
            .collect::<String>()
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }
    fn key(parts: &[&str]) -> String {
        let mut hash = DefaultHasher::new();
        parts.hash(&mut hash);
        format!("{:016x}", hash.finish())
    }
    fn wide(value: &std::path::Path) -> Vec<u16> {
        use std::os::windows::ffi::OsStrExt;
        value.as_os_str().encode_wide().chain(Some(0)).collect()
    }

    struct Native {
        directory: PathBuf,
        logo: PathBuf,
        initialized: bool,
        delivered: HashMap<String, i64>,
        sender: Sender<Work>,
        // Retain handlers until Windows has finished processing each toast.
        active: HashMap<String, (ToastNotification, i64, Vec<String>)>,
    }
    impl Native {
        fn new(directory: PathBuf, sender: Sender<Work>) -> Self {
            let delivered = std::fs::read(directory.join("delivered.json"))
                .ok()
                .and_then(|bytes| serde_json::from_slice(&bytes).ok())
                .unwrap_or_default();
            Self {
                logo: directory.join("scribe-logo.png"),
                directory,
                initialized: false,
                delivered,
                sender,
                active: HashMap::new(),
            }
        }
        fn prepare(&mut self) -> Result<(), String> {
            if self.initialized {
                return Ok(());
            }
            std::fs::create_dir_all(&self.directory).map_err(|e| e.to_string())?;
            std::fs::write(&self.logo, include_bytes!("../icons/scribe-v2/128x128.png"))
                .map_err(|e| e.to_string())?;
            let icon = self.directory.join("scribe.ico");
            std::fs::write(&icon, include_bytes!("../icons/scribe-v2/icon.ico"))
                .map_err(|e| e.to_string())?;
            // Register a dedicated identity without changing Tauri's existing data
            // directory or overwriting the installed application's shortcut.
            let (registry, _) = RegKey::predef(HKEY_CURRENT_USER)
                .create_subkey(format!("Software\\Classes\\AppUserModelId\\{APP_ID}"))
                .map_err(|e| e.to_string())?;
            registry_text(&registry, "DisplayName", "Scribe")?;
            registry_text(&registry, "IconUri", self.logo.to_string_lossy().as_ref())?;
            // Protocol activation uses the shortcut's stub CLSID, not a registered
            // COM server. Remove the incompatible registration from earlier builds.
            match registry.delete_value("CustomActivator") {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.to_string()),
            }
            let programs = PathBuf::from(
                std::env::var_os("APPDATA").ok_or("Windows app data is unavailable")?,
            )
            .join("Microsoft/Windows/Start Menu/Programs/Scribe");
            std::fs::create_dir_all(&programs).map_err(|e| e.to_string())?;
            let executable = wide(&std::env::current_exe().map_err(|e| e.to_string())?);
            let icon_path = wide(&icon);
            let shortcut_path = wide(&programs.join("Scribe Notifications.lnk"));
            unsafe {
                let shortcut: IShellLinkW =
                    CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                        .map_err(|e| e.to_string())?;
                shortcut
                    .SetPath(PCWSTR(executable.as_ptr()))
                    .map_err(|e| e.to_string())?;
                shortcut
                    .SetDescription(&HSTRING::from("Scribe"))
                    .map_err(|e| e.to_string())?;
                shortcut
                    .SetIconLocation(PCWSTR(icon_path.as_ptr()), 0)
                    .map_err(|e| e.to_string())?;
                let properties: IPropertyStore = shortcut.cast().map_err(|e| e.to_string())?;
                let mut app_id = PROPVARIANT::default();
                PropVariantChangeType(
                    &mut app_id,
                    &PROPVARIANT::from(APP_ID),
                    PVCHF_DEFAULT,
                    VT_LPWSTR,
                )
                .map_err(|e| e.to_string())?;
                properties
                    .SetValue(&PROPERTY_ID, &app_id)
                    .map_err(|e| e.to_string())?;
                // Windows persists protocol-activated toasts with a stub CLSID.
                let activator = InitPropVariantFromCLSID(&ACTIVATOR).map_err(|e| e.to_string())?;
                properties
                    .SetValue(&PROPERTY_ACTIVATOR, &activator)
                    .map_err(|e| e.to_string())?;
                properties.Commit().map_err(|e| e.to_string())?;
                let persist: IPersistFile = shortcut.cast().map_err(|e| e.to_string())?;
                persist
                    .Save(PCWSTR(shortcut_path.as_ptr()), true)
                    .map_err(|e| e.to_string())?;
                SHChangeNotify(
                    SHCNE_CREATE,
                    SHCNF_PATHW,
                    Some(shortcut_path.as_ptr().cast()),
                    None,
                );
            }
            self.initialized = true;
            Ok(())
        }
        fn show(
            &mut self,
            title: &str,
            body: &str,
            uri: &str,
            tag: &str,
            sound: bool,
            open_note: bool,
            attribution: &str,
        ) -> Result<bool, String> {
            self.prepare()
                .map_err(|e| format!("Set up Windows notifications: {e}"))?;
            let notifier =
                ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID))
                    .map_err(|e| format!("Create Windows notifier: {e}"))?;
            match notifier.Setting() {
                Ok(setting) if setting != NotificationSetting::Enabled => {
                    return Err("Windows notifications are disabled. Enable Scribe in Windows Settings → System → Notifications.".into());
                }
                // Windows may not have a per-app settings entry until the first
                // toast is submitted. That is not a denial of notification access.
                Err(error) if error.code().0 == 0x80070490u32 as i32 => {}
                Err(error) => return Err(format!("Read Windows notification permission: {error}")),
                Ok(_) => {}
            }
            let action = if open_note {
                format!(
                    "<actions><action content=\"Open note\" activationType=\"protocol\" arguments=\"{}\"/></actions>",
                    xml(uri)
                )
            } else {
                String::new()
            };
            let attribution = if attribution.is_empty() {
                String::new()
            } else {
                format!(
                    "<text placement=\"attribution\">{}</text>",
                    xml(attribution)
                )
            };
            let audio = if sound {
                "<audio src=\"ms-winsoundevent:Notification.Default\"/>"
            } else {
                "<audio silent=\"true\"/>"
            };
            let logo_uri = tauri::Url::from_file_path(&self.logo)
                .map_err(|_| "Could not locate the notification logo")?;
            let content = format!(
                "<toast activationType=\"protocol\" launch=\"{}\"><visual><binding template=\"ToastGeneric\"><image placement=\"appLogoOverride\" src=\"{}\"/><text>{}</text><text>{}</text>{}</binding></visual>{}{}</toast>",
                xml(uri),
                xml(logo_uri.as_str()),
                xml(title),
                xml(body),
                attribution,
                action,
                audio
            );
            let document = XmlDocument::new().map_err(|e| e.to_string())?;
            document
                .LoadXml(&HSTRING::from(content))
                .map_err(|e| e.to_string())?;
            let toast =
                ToastNotification::CreateToastNotification(&document).map_err(|e| e.to_string())?;
            toast
                .SetTag(&HSTRING::from(tag))
                .map_err(|e| e.to_string())?;
            toast
                .SetGroup(&HSTRING::from("scribe"))
                .map_err(|e| e.to_string())?;
            let sender = self.sender.clone();
            let failure_tag = tag.to_string();
            let submitted = now();
            toast
                .Failed(
                    &TypedEventHandler::<ToastNotification, ToastFailedEventArgs>::new(
                        move |_, args| {
                            let error = args
                                .as_ref()
                                .and_then(|args| args.ErrorCode().ok())
                                .map(|code| format!("Windows rejected the notification ({code:?})"))
                                .unwrap_or_else(|| "Windows rejected the notification".into());
                            let _ = sender.send(Work::Failed {
                                tag: failure_tag.clone(),
                                submitted,
                                error,
                            });
                            Ok(())
                        },
                    ),
                )
                .map_err(|e| format!("Listen for notification delivery: {e}"))?;
            notifier
                .Show(&toast)
                .map_err(|e| format!("Show Windows notification: {e}"))?;
            self.active
                .insert(tag.into(), (toast, submitted, Vec::new()));
            Ok(true)
        }
        fn record(&mut self, id: String) {
            self.delivered.insert(id, now());
            self.delivered
                .retain(|_, timestamp| now() - *timestamp < 30 * 86_400_000);
            if self.delivered.len() > 5000 {
                let mut sorted: Vec<_> = self
                    .delivered
                    .iter()
                    .map(|(key, time)| (key.clone(), *time))
                    .collect();
                sorted.sort_by_key(|(_, time)| *time);
                for (id, _) in sorted.into_iter().take(self.delivered.len() - 5000) {
                    self.delivered.remove(&id);
                }
            }
            if let Ok(data) = serde_json::to_vec(&self.delivered) {
                let temp = self.directory.join("delivered.tmp");
                if std::fs::write(&temp, data).is_ok() {
                    if let Err(error) = std::fs::rename(temp, self.directory.join("delivered.json"))
                    {
                        log::warn!("Could not persist notification delivery state: {error}");
                    }
                }
            }
        }
        fn reminders(&mut self, config: &NotificationConfig) -> Result<(), String> {
            if !config.enabled || !config.reminders_enabled {
                return Ok(());
            }
            let Some(user) = config.user_id.as_ref() else {
                return Ok(());
            };
            let timestamp = now();
            for plan in &config.reminders {
                if uuid::Uuid::parse_str(&plan.note_id).is_err()
                    || plan.lead_minutes > 60
                    || plan.due_at <= 0
                {
                    continue;
                }
                let due = plan.due_at.to_string();
                let lead = plan.lead_minutes.to_string();
                let due_key = key(&[user, &plan.note_id, &due, "due"]);
                let early_key = key(&[user, &plan.note_id, &due, &lead, "early"]);
                let early_at = plan.due_at - i64::from(plan.lead_minutes) * 60_000;
                let is_due = timestamp >= plan.due_at;
                if !is_due
                    && (plan.lead_minutes == 0
                        || timestamp < early_at
                        || early_at < plan.updated_at)
                {
                    continue;
                }
                let delivery_key = if is_due { &due_key } else { &early_key };
                if self.delivered.contains_key(delivery_key) || timestamp - plan.due_at > 86_400_000
                {
                    continue;
                }
                let uri = format!(
                    "com.scribe.notes://notifications/open-note?user={user}&note={}",
                    plan.note_id
                );
                let attribution = if is_due {
                    "Note reminder".into()
                } else {
                    format!(
                        "Due in {} minutes",
                        ((plan.due_at - timestamp) / 60_000).max(1)
                    )
                };
                if self.show(
                    if plan.title.trim().is_empty() {
                        "Untitled note"
                    } else {
                        &plan.title
                    },
                    "You scheduled a reminder for this note",
                    &uri,
                    &key(&[user, &plan.note_id]),
                    config.sound,
                    true,
                    &attribution,
                )? {
                    self.record(delivery_key.clone());
                    let tag = key(&[user, &plan.note_id]);
                    if let Some((_, _, keys)) = self.active.get_mut(&tag) {
                        keys.push(delivery_key.clone());
                        if is_due {
                            keys.push(early_key.clone());
                        }
                    }
                    if is_due {
                        self.record(early_key);
                    }
                }
            }
            Ok(())
        }
    }
    pub fn run(
        receiver: mpsc::Receiver<Work>,
        sender: Sender<Work>,
        directory: PathBuf,
        app: AppHandle,
    ) {
        if unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.is_err() {
            log::warn!("Windows notification initialization failed");
            return;
        }
        let mut native = Native::new(directory, sender);
        // Register before the first reminder becomes due so the Shell can discover
        // our shortcut before a notification is submitted.
        if let Err(error) = native.prepare() {
            log::warn!("Notification setup failed: {error}");
        }
        let mut config = NotificationConfig::default();
        let mut retry_at = 0;
        let mut reported: Option<(Option<String>, String)> = None;
        let mut report = |config: &NotificationConfig, error: &str| {
            log::warn!("Desktop notification delivery failed: {error}");
            let issue = (config.user_id.clone(), error.to_string());
            if reported.as_ref() != Some(&issue) {
                let message = if error.starts_with("Windows notifications are disabled") {
                    error.to_string()
                } else {
                    format!(
                        "Scribe couldn't show the Windows notification. Restart Scribe to retry. {error}"
                    )
                };
                let _ = app.emit(
                    "scribe:notification-error",
                    serde_json::json!({ "userId": config.user_id, "message": message }),
                );
                reported = Some(issue);
            }
        };
        loop {
            match receiver.recv_timeout(Duration::from_secs(5)) {
                Ok(Work::Configure(next)) => {
                    if config.user_id != next.user_id && native.initialized {
                        if let Ok(history) = ToastNotificationManager::History() {
                            let _ = history.ClearWithId(&HSTRING::from(APP_ID));
                        }
                    }
                    config = next;
                    retry_at = 0;
                }
                Ok(Work::Failed {
                    tag,
                    submitted,
                    error,
                }) => {
                    if !native
                        .active
                        .get(&tag)
                        .is_some_and(|(_, stamp, _)| *stamp == submitted)
                    {
                        continue;
                    }
                    if let Some((_, _, keys)) = native.active.remove(&tag) {
                        for key in keys {
                            native.delivered.remove(&key);
                        }
                        if let Ok(bytes) = serde_json::to_vec(&native.delivered) {
                            let _ = std::fs::write(native.directory.join("delivered.json"), bytes);
                        }
                        report(&config, &error);
                        retry_at = now() + 60_000;
                    }
                }
                Ok(Work::Show(message)) => {
                    if config.enabled && config.user_id.as_ref() == Some(&message.user_id) {
                        let is_sync_error = matches!(&message.kind, NotificationKind::SyncError);
                        let (title, body, tag) = match message.kind {
                            NotificationKind::QuickCapture => {
                                ("Captured to Scribe", "Your note was saved", "quick-capture")
                            }
                            NotificationKind::SyncError => (
                                "Unable to sync Notes",
                                "Your notes are saved locally. We'll retry syncing automatically.",
                                "sync-error",
                            ),
                        };
                        let id = key(&[&message.user_id, tag]);
                        if !is_sync_error
                            || native
                                .delivered
                                .get(&id)
                                .is_none_or(|last| now() - *last > 300_000)
                        {
                            let uri = format!(
                                "com.scribe.notes://notifications/home?user={}",
                                message.user_id
                            );
                            match native.show(title, body, &uri, tag, config.sound, false, "") {
                                Ok(true) => {
                                    if is_sync_error {
                                        native.record(id.clone());
                                        if let Some((_, _, keys)) = native.active.get_mut(tag) {
                                            keys.push(id);
                                        }
                                    }
                                }
                                Ok(false) => {}
                                Err(error) => {
                                    report(&config, &error);
                                }
                            }
                        }
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            native
                .active
                .retain(|_, (_, submitted, _)| now() - *submitted < 300_000);
            if now() >= retry_at {
                if let Err(error) = native.reminders(&config) {
                    retry_at = now() + 60_000;
                    report(&config, &error);
                }
            }
        }
        unsafe {
            RoUninitialize();
        }
    }
}
