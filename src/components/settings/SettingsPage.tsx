import { SettingsTooltipBoundary } from "./SettingsTooltipBoundary";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Monitor,
  Globe,
  FileText,
  Folder,
  Pencil,
  Plus,
  HardDrive,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Icon, type IconName } from "../Icon";
import { CreateFolderDialog } from "../dialogs/CreateFolderDialog";
import {
  accentColors,
  type AccentColor,
} from "../../features/settings/accentColors";
import {
  defaultShortcutBindings,
  formatShortcut,
  getAltModifierLabel,
  getModifierLabel,
  isMacOS,
  shortcutActions,
  type ShortcutBindings,
  type ShortcutId,
} from "../../features/shortcuts/keyboardShortcuts";
import type { AccountProfile } from "../../features/auth/accountProfile";
import { useWritingPreferences } from "../../features/settings/writingPreferences";
import type { Note, NoteFolder } from "../../types/note";

type Category = {
  id: string;
  label: string;
  icon: IconName;
  color: string;
  description: string;
};
const categories: Category[] = [
  {
    id: "general",
    label: "General",
    icon: "general",
    color: "blue",
    description: "Make Scribe feel right for you.",
  },
  {
    id: "account",
    label: "Account",
    icon: "profile",
    color: "pink",
    description: "Manage your profile and account security.",
  },
  {
    id: "folders",
    label: "Folders",
    icon: "folder",
    color: "amber",
    description: "Arrange, rename, and customize your Note folders.",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: "appearance",
    color: "violet",
    description: "Shape the look and feel of your Notes.",
  },
  {
    id: "editor",
    label: "Editor",
    icon: "note",
    color: "green",
    description: "Tune your writing environment.",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "notifications",
    color: "amber",
    description: "Choose what deserves your attention.",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: "shortcuts",
    color: "cyan",
    description: "Find your flow with keyboard shortcuts.",
  },
  {
    id: "storage",
    label: "Storage",
    icon: "storage",
    color: "purple",
    description: "Review local and cloud storage usage.",
  },
  {
    id: "about",
    label: "About",
    icon: "about",
    color: "pink",
    description: "A little more about Scribe.",
  },
];

const settingId = (label: string) =>
  `setting-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const settingSearchIndex = [
  { label: "Launch at startup", detail: "Save your startup preference on this device.", category: "general", terms: "startup launch windows open boot" },
  { label: "Offline mode", detail: "Keep changes locally and pause cloud sync.", category: "general", terms: "offline network internet sync pause local" },
  { label: "Dark appearance", detail: "Use the Midnight dark theme.", category: "appearance", terms: "theme night midnight dark", targetId: "setting-color-mood" },
  { label: "Light appearance", detail: "Use the Daylight light theme.", category: "appearance", terms: "theme day daylight light", targetId: "setting-color-mood" },
  { label: "Accent color", detail: "Choose the accent used throughout Scribe.", category: "appearance", terms: "colour color swatches accent" },
  { label: "Font family", detail: "Choose the typeface for Note content.", category: "appearance", terms: "typography font typeface georgia monospace dm sans" },
  { label: "Text size", detail: "Adjust Note text size.", category: "appearance", terms: "typography font size small medium large" },
  { label: "Spell check", detail: "Underline possible spelling mistakes as you type.", category: "editor", terms: "spelling writing proofread" },
  { label: "Desktop notifications", detail: "Save your desktop alert preference.", category: "notifications", terms: "desktop notification alerts enable disable" },
  { label: "Sounds", detail: "Save your sound preference for app interactions.", category: "notifications", terms: "audio sound notification mute" },
  { label: "Note reminders", detail: "Save your preference for future Note reminders.", category: "notifications", terms: "reminder notification alert scheduled" },
  { label: "Reminder lead time", detail: "Choose how many minutes before a reminder to notify; delivery is coming soon.", category: "notifications", terms: "before minutes time 5 10 15 30 60" },
  { label: "Keyboard shortcuts", detail: "Customize app shortcuts or restore their defaults.", category: "shortcuts", terms: "keys keyboard hotkey commands bindings reset formatting" },
  { label: "Local storage", detail: "View estimated local Notes, folders, and preferences usage.", category: "storage", terms: "device disk usage chart pie donut local offline", targetId: "setting-local-storage" },
  { label: "Cloud storage", detail: "View estimated cloud content against a 15 MB allowance.", category: "storage", terms: "cloud quota limit capacity usage chart pie donut 15mb" },
  { label: "Folder organization", detail: "Reorder, rename, recolor, or delete your folders.", category: "folders", terms: "organize folders reorder rename delete icon color unfiled", targetId: "setting-manage-folders" },
  { label: "Profile photo", detail: "Profile photo controls are coming soon.", category: "account", terms: "avatar picture image photo" },
  { label: "Display name", detail: "View your account display name; editing is coming soon.", category: "account", terms: "username profile name" },
  { label: "Email address", detail: "View the email address associated with your account.", category: "account", terms: "email login address" },
  { label: "Password & security", detail: "Review account security controls.", category: "account", terms: "security password verification" },
  { label: "Reset password", detail: "Password reset controls are coming soon.", category: "account", terms: "password reset recovery" },
  { label: "Two-step verification", detail: "Additional sign-in protection is coming soon.", category: "account", terms: "2fa mfa two factor authentication security" },
  { label: "Linked accounts", detail: "View Google and GitHub profiles; Link and Unlink are preview controls.", category: "account", terms: "social provider google github link unlink connected" },
  { label: "Signed-in devices", detail: "Preview sessions for this PC, Chrome extension, and mobile app.", category: "account", terms: "sessions devices windows android mobile chrome pc sign out logout" },
  { label: "Sign out from all devices", detail: "Preview the option to sign out every device.", category: "account", terms: "all sessions logout sign out revoke", targetId: "setting-signed-in-devices" },
  { label: "Account data", detail: "Review upcoming export and deletion controls.", category: "account", terms: "privacy export delete data" },
  { label: "Export account data", detail: "Account export is coming soon.", category: "account", terms: "download backup export" },
  { label: "Delete account", detail: "Account deletion is coming soon.", category: "account", terms: "delete remove account privacy" },
  { label: "About Scribe", detail: "View version and product information.", category: "about", terms: "version information app", targetId: "setting-scribe" },
];

function SettingToggle({
  label,
  detail,
  checked,
  onChange,
  color = "violet",
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  color?: string;
}) {
  return (
    <div className="setting-row" id={settingId(label)}>
      <div className="setting-row-copy" data-tooltip={detail}>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <button
        className={`setting-switch ${checked ? "checked" : ""} switch-${color}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-tooltip={detail}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function SettingSelect({
  label,
  detail,
  value,
  options,
  onChange,
}: {
  label: string;
  detail: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [menu, setMenu] = useState<{ left: number; top: number; width: number; maxHeight: number; variables: React.CSSProperties } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = menu !== null;
  const close = () => { setMenu(null); triggerRef.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !menuRef.current?.contains(target)) setMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenu(null); triggerRef.current?.focus(); }
    };
    const closeOnMove = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnMove);
    window.addEventListener("scroll", closeOnMove, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnMove);
      window.removeEventListener("scroll", closeOnMove, true);
    };
  }, [open]);
  const toggleMenu = () => {
    if (open) { setMenu(null); return; }
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const styles = getComputedStyle(trigger);
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const height = Math.min(options.length * 34 + 12, 280, Math.max(below, above));
    const width = Math.min(Math.max(rect.width, 160), window.innerWidth - 16);
    const variables = Object.fromEntries(["--surface", "--surface-2", "--surface-3", "--text", "--muted", "--border", "--accent", "--accent-soft"].map((name) => [name, styles.getPropertyValue(name)])) as React.CSSProperties;
    setMenu({ left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top: below >= height ? rect.bottom + 6 : Math.max(8, rect.top - height - 6), width, maxHeight: height, variables });
  };
  return (
    <div className="setting-row" id={settingId(label)}>
      <div className="setting-row-copy" data-tooltip={detail}><strong>{label}</strong><span>{detail}</span></div>
      <div className="setting-select-wrap" ref={pickerRef}>
        <button ref={triggerRef} type="button" className={`setting-select-trigger ${open ? "is-open" : ""}`} aria-label={`${label}: ${value}`} aria-haspopup="listbox" aria-expanded={open} data-tooltip={open ? undefined : detail} onClick={toggleMenu}>
          <span>{value}</span><ChevronDown size={15} />
        </button>
        {menu && createPortal(
          <div ref={menuRef} className="setting-select-menu settings-floating-menu" role="listbox" aria-label={label} style={{ ...menu.variables, position: "fixed", left: menu.left, top: menu.top, width: menu.width, maxHeight: menu.maxHeight }}>
            {options.map((option) => <button type="button" key={option} role="option" aria-selected={option === value} className={option === value ? "selected" : ""} onClick={() => { onChange(option); close(); }}><span className="setting-option-check">{option === value && <Check size={14} />}</span><span>{option}</span></button>)}
          </div>, document.body,
        )}
      </div>
    </div>
  );
}

function SettingCard({
  title,
  description,
  children,
  accent = "violet",
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  accent?: string;
  id?: string;
}) {
  return (
    <section
      className={`settings-card accent-${accent}`}
      id={id ?? settingId(title)}
    >
      <div className="settings-card-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

type StorageMetrics = {
  noteCount: number;
  folderCount: number;
  noteBytes: number;
  folderBytes: number;
  settingsBytes: number;
};
const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

function AccountSettingRow({
  id,
  label,
  detail,
  action,
}: {
  id: string;
  label: string;
  detail: string;
  action: string;
}) {
  return (
    <div className="account-setting-row" id={settingId(id)}>
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <span className="settings-tooltip-target" tabIndex={0} data-tooltip={`${action} is not available yet`}><button type="button" disabled data-tooltip={`${action} is not available yet`}>
        {action}
        <ChevronRight size={15} />
      </button></span>
    </div>
  );
}

function StorageSettings({ metrics }: { metrics: StorageMetrics }) {
  const local = metrics.noteBytes + metrics.folderBytes + metrics.settingsBytes;
  const cloud = metrics.noteBytes + metrics.folderBytes;
  const limit = 15 * 1024 * 1024;
  const percent = Math.min(100, cloud / limit * 100);
  const noteShare = local ? metrics.noteBytes / local * 100 : 0;
  const folderShare = local ? metrics.folderBytes / local * 100 : 0;
  return <>
    <SettingCard title="Cloud storage" description="15 MB allowance for synced Notes and folders." accent="purple" id={settingId("Cloud storage")}>
      <div className="storage-chart-layout">
        <div className="settings-donut" role="img" aria-label={`Estimated cloud usage ${formatBytes(cloud)} of 15 MB`} style={{ background: `conic-gradient(var(--category) ${percent}%, var(--border) 0)` }}><div><Cloud size={22} /><strong>{percent.toFixed(1)}%</strong><small>used</small></div></div>
        <div className="storage-chart-copy"><strong>{formatBytes(cloud)} <span>/ 15 MB</span></strong><p>{formatBytes(Math.max(0, limit - cloud))} remaining</p><small>Estimated from current Notes and folders, including Trash and pending changes. Server usage may differ.</small></div>
      </div>
      <div className="storage-detail-row"><FileText size={16} /><span>Notes</span><strong>{formatBytes(metrics.noteBytes)}</strong></div>
      <div className="storage-detail-row"><Folder size={16} /><span>Folders</span><strong>{formatBytes(metrics.folderBytes)}</strong></div>
      {cloud > limit && <p className="settings-info-banner">Estimated content exceeds 15 MB. Remove unwanted Notes to reduce usage.</p>}
    </SettingCard>
    <SettingCard title="On this device" description="Your local copy keeps Notes available offline." accent="purple" id={settingId("Local storage")}>
      <div className="storage-chart-layout">
        <div className="settings-donut" role="img" aria-label={`Local content ${formatBytes(local)}`} style={{ background: local ? `conic-gradient(var(--category) ${noteShare}%, #25bfd1 ${noteShare}% ${noteShare + folderShare}%, #f6a623 0)` : 'var(--border)' }}><div><HardDrive size={22} /><strong>{formatBytes(local)}</strong><small>local content</small></div></div>
        <div className="storage-chart-copy"><strong>{metrics.noteCount} Notes · {metrics.folderCount} folders</strong><p>Saved locally first, synced in batches.</p><small>Serialized content estimate. Disk usage, sync history, and database overhead are not included.</small></div>
      </div>
      <div className="storage-breakdown-list">{[['Notes', metrics.noteBytes, 'notes-dot'], ['Folders', metrics.folderBytes, 'folders-dot'], ['Preferences', metrics.settingsBytes, 'settings-dot']].map(([label, bytes, dot]) => <div key={String(label)}><span className={`storage-color-dot ${dot}`} /><span className="storage-breakdown-label"><strong>{label}</strong></span><b>{formatBytes(Number(bytes))}</b></div>)}</div>
    </SettingCard>
  </>;
}

function ProviderLogo({ provider }: { provider: "google" | "github" }) {
  return provider === "google" ? (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.83-1.76-5.62-4.13H3.04v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.38 13.91a6 6 0 0 1 0-3.82V7.5H3.04a10 10 0 0 0 0 9l3.34-2.59Z" />
      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.5l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.5l3.34 2.59C7.17 7.72 9.39 5.96 12 5.96Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" /></svg>
  );
}

function AccountSettings({ profile }: { profile: AccountProfile }) {
  const initials = profile.displayName.trim().charAt(0).toUpperCase() || "A";
  return (
    <>
      <SettingCard
        title="Your profile"
        description="Your account details from Supabase."
        accent="pink"
        id={settingId("Profile photo")}
      >
        <div className="account-profile-card">
          <div className="account-profile-avatar">
            {initials}
            <span className="settings-tooltip-target" tabIndex={0} data-tooltip="Profile photos are not available yet"><button
              type="button"
              disabled
              aria-label="Change profile photo"
              data-tooltip="Profile photos are not available yet"
            >
              <Camera size={14} />
            </button></span>
          </div>
          <div className="account-profile-copy">
            <strong>{profile.displayName}</strong>
            <span>{profile.email}</span>
          </div>
          <span className="coming-soon-badge">Preview</span>
        </div>
        <AccountSettingRow
          id="Display name"
          label="Display name"
          detail={profile.displayName}
          action="Managed soon"
        />
        <AccountSettingRow
          id="Email address"
          label="Email address"
          detail={profile.email}
          action="Supabase"
        />
      </SettingCard>
      <SettingCard
        title="Password & security"
        description="Supabase protects sign-in and email verification. Additional account controls are planned."
        accent="pink"
        id={settingId("Password & security")}
      >
        <div className="account-security-intro">
          <span>
            <ShieldCheck size={18} />
          </span>
          <div>
            <strong>Account sign-in is protected by Supabase</strong>
            <small>
              Your session stays in this app’s local storage on this device.
              Sign out to remove it.
            </small>
          </div>
        </div>
        <AccountSettingRow
          id="Reset password"
          label="Reset password"
          detail="Request a password reset link."
          action="Coming soon"
        />
        <AccountSettingRow
          id="Two-step verification"
          label="Two-step verification"
          detail="Add another layer of sign-in protection."
          action="Coming soon"
        />
      </SettingCard>
      <SettingCard title="Linked accounts" id={settingId("Linked accounts")} description="Connected sign-in providers. Link and unlink actions are previews." accent="pink">
        {(["google", "github"] as const).map((provider) => {
          const identity = profile.linkedAccounts?.find((item) => item.provider === provider);
          return (
            <div className="account-connection-row" key={provider}>
              <div className="account-icon-tile"><ProviderLogo provider={provider} /></div>
              <div className="account-connection-info">
                <strong>{provider === "google" ? "Google" : "GitHub"}</strong>
                {identity?.name && <span>{identity.name}</span>}
                {identity?.email && <span>{identity.email}</span>}
                <small className={identity ? "connection-status-linked" : ""}>{identity ? "Linked to your account" : "No account linked"}</small>
              </div>
              <span className="settings-tooltip-target" tabIndex={0} data-tooltip="Preview only: account linking and unlinking are not implemented"><button type="button" className={`account-preview-action ${identity ? "action-danger" : "action-link"}`} disabled data-tooltip="Preview only: account linking and unlinking are not implemented">{identity ? "Unlink" : "Link"}</button></span>
            </div>
          );
        })}
      </SettingCard>
      <SettingCard title="Signed-in devices" id={settingId("Signed-in devices")} description="Sample sessions · device management preview." accent="pink">
        {[
          { icon: Monitor, name: "This PC", platform: "Scribe for Windows · Windows 11", activity: "Active now", current: true },
          { icon: Globe, name: "Chrome extension", platform: "Chrome · Windows 11", activity: "Last active 2 hours ago", current: false },
          { icon: Smartphone, name: "Mobile app", platform: "Scribe Mobile · Android", activity: "Last active yesterday", current: false },
        ].map(({ icon: Device, name, platform, activity, current }) => (
          <div className="account-connection-row" key={name}>
            <div className="account-icon-tile"><Device size={23} /></div>
            <div className="account-connection-info">
              <div className="device-name-line"><strong>{name}</strong>{current && <span className="device-current-badge">Current device</span>}</div>
              <span>{platform}</span>
              <small>{activity}</small>
            </div>
            {!current && <span className="settings-tooltip-target" tabIndex={0} data-tooltip="Preview only: device sign-out is not implemented"><button type="button" className="account-preview-action action-danger" disabled data-tooltip="Preview only: device sign-out is not implemented">Sign out</button></span>}
          </div>
        ))}
        <div className="device-actions-footer"><span>Session controls are coming soon.</span><span className="settings-tooltip-target" tabIndex={0} data-tooltip="Preview only: signing out all devices is not implemented"><button type="button" className="account-preview-action action-danger" disabled data-tooltip="Preview only: signing out all devices is not implemented">Sign out from all devices</button></span></div>
      </SettingCard>
      <SettingCard
        title="Account data"
        description="Control your account and personal data."
        accent="pink"
        id={settingId("Account data")}
      >
        <AccountSettingRow
          id="Export account data"
          label="Export account data"
          detail="Download a copy of your Notes and account details."
          action="Coming soon"
        />
        <AccountSettingRow
          id="Delete account"
          label="Delete account"
          detail="Permanently remove your account and synced data."
          action="Coming soon"
        />
      </SettingCard>
    </>
  );
}

function KeyboardShortcutSettings({
  shortcuts,
  onChange,
}: {
  shortcuts: ShortcutBindings;
  onChange: (value: ShortcutBindings) => void;
}) {
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!recording) return;
    const capture = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRecording(null);
        setError("");
        return;
      }
      const command = isMacOS() ? event.metaKey : event.ctrlKey;
      if (!command || event.altKey || event.key.length !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      const key = event.key.toLowerCase();
      if ((key === "b" || key === "i") && !event.shiftKey) {
        setError(
          `${getModifierLabel()} + ${key.toUpperCase()} is reserved for text formatting.`,
        );
        return;
      }
      const conflict = shortcutActions.find(
        (action) =>
          action.id !== recording &&
          shortcuts[action.id].key === key &&
          shortcuts[action.id].shift === event.shiftKey,
      );
      if (conflict) {
        setError(`That shortcut is already assigned to ${conflict.label}.`);
        return;
      }
      onChange({ ...shortcuts, [recording]: { key, shift: event.shiftKey } });
      setRecording(null);
      setError("");
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [recording, shortcuts, onChange]);

  return (
    <SettingCard
      title="Keyboard shortcuts"
      description="Choose a modifier shortcut for common actions. Press the shortcut you want after selecting Change."
      accent="cyan"
    >
      <div className="shortcut-settings-list">
        {shortcutActions.map((action) => (
          <div className="shortcut-setting-row" key={action.id}>
            <div className="shortcut-setting-copy">
              <strong>{action.label}</strong>
              <span>{action.description}</span>
            </div>
            <button
              data-tooltip={`Change ${action.label} shortcut`}
              className={`shortcut-edit-button ${recording === action.id ? "is-recording" : ""}`}
              onClick={() => {
                setError("");
                setRecording(action.id);
              }}
            >
              {recording === action.id
                ? "Press keys…"
                : formatShortcut(shortcuts[action.id])}
            </button>
          </div>
        ))}
      </div>
      {error && (
        <div className="shortcut-error" role="alert">
          {error}
        </div>
      )}
      <div className="shortcut-fixed-list">
        <strong>Text formatting</strong>
        <span>
          Bold <kbd>{getModifierLabel()} + B</kbd>
        </span>
        <span>
          Italic <kbd>{getModifierLabel()} + I</kbd>
        </span>
        <span>
          Heading 1{" "}
          <kbd>
            {getModifierLabel()} + {getAltModifierLabel()} + 1
          </kbd>
        </span>
        <span>
          Heading 2{" "}
          <kbd>
            {getModifierLabel()} + {getAltModifierLabel()} + 2
          </kbd>
        </span>
        <span>
          Insert link <kbd>{getModifierLabel()} + K</kbd>
        </span>
        <span>
          Close or discard a draft <kbd>Esc</kbd>
        </span>
        <small>
          Formatting and dialog shortcuts are fixed and can’t be reassigned.
        </small>
      </div>
      <button
        className="shortcut-reset-button"
        data-tooltip="Restore all app shortcuts to their defaults"
        onClick={() => {
          onChange(defaultShortcutBindings);
          setRecording(null);
          setError("");
        }}
      >
        Restore default shortcuts
      </button>
    </SettingCard>
  );
}

function FolderManagementSettings({
  folders,
  notes,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onMoveFolder,
  onMoveSystemFolder,
  unfiledPosition,
}: {
  folders: NoteFolder[];
  notes: Note[];
  onCreateFolder: (
    name: string,
    icon: NoteFolder["icon"],
    color: NoteFolder["color"],
  ) => boolean;
  onEditFolder: (
    currentId: string,
    name: string,
    icon: NoteFolder["icon"],
    color: NoteFolder["color"],
  ) => boolean;
  onDeleteFolder: (id: string) => void;
  onMoveFolder: (id: string, offset: -1 | 1) => void;
  onMoveSystemFolder: (offset: -1 | 1) => void;
  unfiledPosition: number;
}) {
  const [creating, setCreating] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const systemFolderOrder = Math.max(
    0,
    Math.min(folders.length, unfiledPosition),
  );

  return (
    <>
      <SettingCard
        title="Your folders"
        description="Arrange the folders in your sidebar and update their name, icon, or color. Deleting a folder keeps its Notes and moves them to All Notes."
        accent="amber"
        id="setting-manage-folders"
      >
        <div className="folder-settings-toolbar">
          <span>
            {folders.length + 1} {folders.length === 0 ? "folder" : "folders"}
          </span>
          <button type="button" onClick={() => setCreating(true)}>
            <Plus size={14} /> New folder
          </button>
        </div>
        <div className="folder-settings-list">
          {Array.from({ length: folders.length + 1 }, (_, position) => {
            const systemPosition = systemFolderOrder;
            if (position === systemPosition)
              return (
                <div
                  className="folder-settings-entry system-folder-entry"
                  key="system:unfiled"
                >
                  <div className="folder-settings-row">
                    <span className="folder-settings-icon folder-tone-blue">
                      <Icon name="folder" size={16} />
                    </span>
                    <div className="folder-settings-copy">
                      <strong>Unfiled</strong>
                      <span>
                        System folder ·{" "}
                        {
                          notes.filter(
                            (note) => !note.deletedAt && note.folderId === null,
                          ).length
                        }{" "}
                        Notes
                      </span>
                    </div>
                    <div className="folder-settings-actions">
                      <div
                        className="folder-order-actions"
                        aria-label="Reorder Unfiled"
                      >
                        <button
                          type="button"
                          aria-label="Move Unfiled up"
                          disabled={systemPosition === 0}
                          onClick={() => onMoveSystemFolder(-1)}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Move Unfiled down"
                          disabled={systemPosition === folders.length}
                          onClick={() => onMoveSystemFolder(1)}
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                      <span className="system-folder-lock">System</span>
                    </div>
                  </div>
                </div>
              );
            const folderIndex =
              position < systemPosition ? position : position - 1;
            const folder = folders[folderIndex];
            if (!folder) return null;
            {
              const noteCount = notes.filter(
                (note) => !note.deletedAt && note.folderId === folder.id,
              ).length;
              return (
                <div className="folder-settings-entry" key={folder.id}>
                  <div className="folder-settings-row">
                    <span
                      className={`folder-settings-icon folder-tone-${folder.color}`}
                    >
                      <Icon name={folder.icon} size={16} />
                    </span>
                    <div className="folder-settings-copy">
                      <strong>{folder.name}</strong>
                      <span>
                        {noteCount} {noteCount === 1 ? "note" : "notes"}
                      </span>
                    </div>
                    <div className="folder-settings-actions">
                      <div
                        className="folder-order-actions"
                        aria-label={`Reorder ${folder.name}`}
                      >
                        <span className="settings-tooltip-target" tabIndex={0} data-tooltip="Move folder up"><button
                          type="button"
                          aria-label={`Move ${folder.name} up`}
                          data-tooltip="Move folder up"
                          disabled={position === 0}
                          onClick={() => onMoveFolder(folder.id, -1)}
                        >
                          <ArrowUp size={14} />
                        </button></span>
                        <span className="settings-tooltip-target" tabIndex={0} data-tooltip="Move folder down"><button
                          type="button"
                          aria-label={`Move ${folder.name} down`}
                          data-tooltip="Move folder down"
                          disabled={position === folders.length}
                          onClick={() => onMoveFolder(folder.id, 1)}
                        >
                          <ArrowDown size={14} />
                        </button></span>
                      </div>
                      <button
                        type="button"
                        className="folder-edit-action"
                        aria-label={`Edit ${folder.name}`}
                        data-tooltip={`Edit ${folder.name}`}
                        onClick={() => setEditingFolder(folder)}
                      >
                        <Pencil size={13} /> <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        className="folder-delete-action"
                        aria-label={`Delete ${folder.name}`}
                        data-tooltip={`Delete ${folder.name}`}
                        onClick={() => setPendingDelete(folder.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {pendingDelete === folder.id && (
                    <div
                      className="folder-delete-confirm"
                      role="group"
                      aria-label={`Confirm deleting ${folder.name}`}
                    >
                      <span>
                        Delete “{folder.name}”? Its Notes will stay in All
                        Notes.
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(null)}
                      >
                        Keep folder
                      </button>
                      <button
                        type="button"
                        className="confirm-delete"
                        onClick={() => {
                          onDeleteFolder(folder.id);
                          setPendingDelete(null);
                        }}
                      >
                        Delete folder
                      </button>
                    </div>
                  )}
                </div>
              );
            }
          })}
        </div>
      </SettingCard>
      {(creating || editingFolder) && (
        <CreateFolderDialog
          key={editingFolder?.name ?? "new-folder"}
          folder={editingFolder ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditingFolder(null);
          }}
          onCreate={onCreateFolder}
          onEdit={onEditFolder}
        />
      )}
    </>
  );
}

function CategoryContent({
  category,
  dark,
  setDark,
  accent,
  onAccentChange,
  fontFamily,
  onFontFamilyChange,
  shortcuts,
  onShortcutsChange,
  offlineMode,
  onOfflineModeChange,
  storageMetrics,
  profile,
  folders,
  notes,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onMoveFolder,
  onMoveSystemFolder,
  unfiledPosition,
}: {
  category: Category;
  dark: boolean;
  setDark: (value: boolean) => void;
  accent: AccentColor;
  onAccentChange: (value: AccentColor) => void;
  fontFamily: string;
  onFontFamilyChange: (value: string) => void;
  shortcuts: ShortcutBindings;
  onShortcutsChange: (value: ShortcutBindings) => void;
  offlineMode: boolean;
  onOfflineModeChange: (enabled: boolean) => void;
  storageMetrics: StorageMetrics;
  profile: AccountProfile;
  folders: NoteFolder[];
  notes: Note[];
  onCreateFolder: (
    name: string,
    icon: NoteFolder["icon"],
    color: NoteFolder["color"],
  ) => boolean;
  onEditFolder: (
    currentId: string,
    name: string,
    icon: NoteFolder["icon"],
    color: NoteFolder["color"],
  ) => boolean;
  onDeleteFolder: (id: string) => void;
  onMoveFolder: (id: string, offset: -1 | 1) => void;
  onMoveSystemFolder: (offset: -1 | 1) => void;
  unfiledPosition: number;
}) {
  const [preferences, updatePreferences] = useWritingPreferences();
  const toggles = preferences;
  const values = { size: preferences.size };
  const toggle = (key: "launch" | "spellcheck" | "reminders" | "desktop" | "sounds") => (value: boolean) => updatePreferences({ [key]: value });
  const change = (key: "size" | "reminderLead") => (value: string) => updatePreferences({ [key]: value });
  switch (category.id) {
    case "general":
      return (
        <>
          <SettingCard
            title="A smoother start"
            description="A few small choices that make Scribe yours."
            accent="blue"
          >
            <SettingToggle
              label="Launch at startup"
              detail="Open Scribe when you sign in to your computer."
              checked={toggles.launch}
              onChange={toggle("launch")}
              color="blue"
            />
            <SettingToggle
              label="Offline mode"
              detail="Keep changes on this device and pause cloud sync until you turn this off."
              checked={offlineMode}
              onChange={onOfflineModeChange}
              color="blue"
            />
          </SettingCard>
        </>
      );
    case "account":
      return <AccountSettings profile={profile} />;
    case "folders":
      return (
        <FolderManagementSettings
          folders={folders}
          notes={notes}
          onCreateFolder={onCreateFolder}
          onEditFolder={onEditFolder}
          onDeleteFolder={onDeleteFolder}
          onMoveFolder={onMoveFolder}
          onMoveSystemFolder={onMoveSystemFolder}
          unfiledPosition={unfiledPosition}
        />
      );
    case "appearance":
      return (
        <>
          <SettingCard
            title="Color & mood"
            description="Choose a canvas for your Notes. Your choice updates the whole app."
            accent="violet"
            id={settingId("Color & mood")}
          >
            <div className="theme-choice-row">
              <button
                className={`theme-choice theme-choice-dark ${dark ? "chosen" : ""}`}
                data-tooltip="Use the Midnight dark theme"
                onClick={() => setDark(true)}
                aria-pressed={dark}
              >
                <span className="theme-preview dark-preview">
                  <i />
                  <i />
                  <i />
                </span>
                <strong>Midnight</strong>
                <span>Dark canvas</span>
              </button>
              <button
                className={`theme-choice theme-choice-light ${!dark ? "chosen" : ""}`}
                data-tooltip="Use the Daylight light theme"
                onClick={() => setDark(false)}
                aria-pressed={!dark}
              >
                <span className="theme-preview light-preview">
                  <i />
                  <i />
                  <i />
                </span>
                <strong>Daylight</strong>
                <span>Light canvas</span>
              </button>
            </div>
          </SettingCard>
          <SettingCard
            title="Accent color"
            description="Your color selection is used throughout the app."
            accent="pink"
          >
            <div className="accent-swatches">
              {Object.entries(accentColors).map(([key, item]) => (
                <button
                  key={key}
                  className={`accent-swatch ${accent === key ? "selected" : ""}`}
                  style={{ "--swatch": item.color } as React.CSSProperties}
                  onClick={() => onAccentChange(key as AccentColor)}
                  aria-label={`${item.label} accent`}
                  data-tooltip={`Use ${item.label} accent`}
                >
                  {accent === key && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          </SettingCard>
          <SettingCard title="Typography" description="Choose a comfortable typeface and size for your Notes." accent="violet">
            <SettingSelect
              label="Font family"
              detail="Choose the voice of your Notes."
              value={fontFamily}
              options={["DM Sans", "System default", "Georgia", "Monospace"]}
              onChange={onFontFamilyChange}
            />
            <SettingSelect
              label="Text size"
              detail="Adjust editor text to your preference."
              value={values.size}
              options={["Small", "Medium", "Large"]}
              onChange={change("size")}
            />
          </SettingCard>
        </>
      );
    case "editor":
      return (
        <>
          <SettingCard
            title="Writing setup"
            description="Set up a calm, comfortable place to write."
            accent="green"
          >
            <SettingToggle
              label="Spell check"
              detail="Underline possible spelling mistakes as you type."
              checked={toggles.spellcheck}
              onChange={toggle("spellcheck")}
              color="green"
            />
          </SettingCard>
        </>
      );
    case "notifications":
      return (
        <>
          <SettingCard
            title="Stay in the loop"
            description="Choose which updates Scribe can send your way."
            accent="amber"
          >
            <SettingToggle
              label="Note reminders"
              detail="Get a gentle nudge for reminders you create."
              checked={toggles.reminders}
              onChange={toggle("reminders")}
              color="amber"
            />
            <SettingToggle
              label="Desktop notifications"
              detail="Enable desktop alerts when notification delivery is available."
              checked={toggles.desktop}
              onChange={toggle("desktop")}
              color="amber"
            />
            <SettingSelect label="Reminder lead time" detail="Notify before a reminder is due. Delivery is coming soon; your preference is saved." value={preferences.reminderLead} options={["At the time", "5 minutes", "10 minutes", "15 minutes", "30 minutes", "60 minutes"]} onChange={change("reminderLead")} />
            <SettingToggle
              label="Sounds"
              detail="Play subtle sounds for app interactions."
              checked={toggles.sounds}
              onChange={toggle("sounds")}
              color="amber"
            />
          </SettingCard>
        </>
      );
    case "shortcuts":
      return (
        <KeyboardShortcutSettings
          shortcuts={shortcuts}
          onChange={onShortcutsChange}
        />
      );
    case "storage":
      return <StorageSettings metrics={storageMetrics} />;
    default:
      return (
        <>
          <SettingCard
            title="Scribe"
            description="A quiet place for everything on your mind."
            accent="pink"
          >
            <div className="about-mark">
              <div className="brand-mark">
                <Icon name="note" size={22} />
              </div>
              <div>
                <strong>Scribe for Windows</strong>
                <span>Version 0.1.0 · Preview</span>
              </div>
            </div>
            <div className="settings-info-banner">
              <span className="settings-info-icon">
                <Icon name="info" size={17} />
              </span>
              <span>
                Built for thoughtful Notes, with local saves and cloud sync.
              </span>
            </div>
          </SettingCard>
        </>
      );
  }
}

type SearchResult = {
  label: string;
  detail: string;
  category: Category;
  targetId?: string;
  isCategory?: boolean;
};

function SettingsSearchResults({
  results,
  onOpen,
}: {
  results: SearchResult[];
  onOpen: (result: SearchResult) => void;
}) {
  if (!results.length)
    return (
      <div className="settings-search-empty">
        <span className="settings-search-empty-icon">
          <Icon name="search" size={20} />
        </span>
        <strong>No settings found</strong>
        <span>
          Try a name like “autosave”, “password”, “accent”, or “storage”.
        </span>
      </div>
    );
  const grouped = categories
    .map((category) => ({
      category,
      results: results.filter((result) => result.category.id === category.id),
    }))
    .filter((group) => group.results.length);
  return (
    <div className="settings-search-results">
      {grouped.map((group) => (
        <section className="settings-result-group" key={group.category.id}>
          <div className="settings-result-group-title">
            <span
              className={`settings-category-icon category-${group.category.color}`}
            >
              <Icon name={group.category.icon} size={15} />
            </span>
            <strong>{group.category.label}</strong>
            <span>{group.results.length}</span>
          </div>
          <div className="settings-result-list">
            {group.results.map((result, index) => (
              <button
                className="settings-result-card"
                key={`${result.label}-${index}`}
                onClick={() => onOpen(result)}
              >
                <span
                  className={`settings-result-icon category-${group.category.color}`}
                >
                  <Icon
                    name={result.isCategory ? group.category.icon : "settings"}
                    size={16}
                  />
                </span>
                <span className="settings-result-copy">
                  <strong>{result.label}</strong>
                  <small>{result.detail}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function SettingsPage({
  dark,
  accent,
  onAccentChange,
  fontFamily,
  onFontFamilyChange,
  onToggleTheme,
  onClose,
  shortcuts,
  onShortcutsChange,
  offlineMode,
  onOfflineModeChange,
  storageMetrics,
  profile,
  folders,
  notes,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onMoveFolder,
  onMoveSystemFolder,
  unfiledPosition,
}: {
  dark: boolean;
  accent: AccentColor;
  onAccentChange: (value: AccentColor) => void;
  fontFamily: string;
  onFontFamilyChange: (value: string) => void;
  onToggleTheme: (value: boolean) => void;
  onClose: () => void;
  shortcuts: ShortcutBindings;
  onShortcutsChange: (value: ShortcutBindings) => void;
  offlineMode: boolean;
  onOfflineModeChange: (enabled: boolean) => void;
  storageMetrics: StorageMetrics;
  profile: AccountProfile;
  folders: NoteFolder[];
  notes: Note[];
  onCreateFolder: (
    name: string,
    icon: NoteFolder["icon"],
    color: NoteFolder["color"],
  ) => boolean;
  onEditFolder: (
    currentId: string,
    name: string,
    icon: NoteFolder["icon"],
    color: NoteFolder["color"],
  ) => boolean;
  onDeleteFolder: (id: string) => void;
  onMoveFolder: (id: string, offset: -1 | 1) => void;
  onMoveSystemFolder: (offset: -1 | 1) => void;
  unfiledPosition: number;
}) {
  const [categoryId, setCategoryId] = useState("general");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const matchingSettings = useMemo(
    () =>
      settingSearchIndex
        .filter((item) =>
          `${item.label} ${item.detail} ${item.terms} ${categories.find((category) => category.id === item.category)?.label ?? ""}`
            .toLowerCase()
            .includes(normalizedQuery),
        )
        .map((item) => ({
          ...item,
          category: categories.find(
            (category) => category.id === item.category,
          )!,
        })),
    [normalizedQuery],
  );
  const matchingCategoryResults = useMemo(
    () =>
      categories
        .filter(
          (category) =>
            normalizedQuery &&
            category.label.toLowerCase().includes(normalizedQuery),
        )
        .map((category) => ({
          label: `${category.label} settings`,
          detail: category.description,
          category,
          isCategory: true,
        })),
    [normalizedQuery],
  );
  const searchResults: SearchResult[] = [
    ...matchingCategoryResults,
    ...matchingSettings.map((item) => ({
      label: item.label,
      detail: item.detail,
      category: item.category,
      targetId: item.targetId ?? settingId(item.label),
    })),
  ];
  const filteredCategories = normalizedQuery
    ? categories.filter(
        (category) =>
          matchingCategoryResults.some(
            (result) => result.category.id === category.id,
          ) ||
          matchingSettings.some((result) => result.category.id === category.id),
      )
    : categories;
  const category =
    categories.find((item) => item.id === categoryId) ?? categories[0];
  const activeCategory =
    (filteredCategories.some((item) => item.id === categoryId)
      ? category
      : filteredCategories[0]) ?? categories[0];
  const openSearchResult = (result: SearchResult) => {
    setCategoryId(result.category.id);
    setQuery("");
    if (result.targetId)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const target = document.getElementById(result.targetId!);
          target?.scrollIntoView({ behavior: "smooth", block: "center" });
          target?.classList.add("setting-search-highlight");
          window.setTimeout(
            () => target?.classList.remove("setting-search-highlight"),
            1500,
          );
        }),
      );
  };
  return (
    <SettingsTooltipBoundary dark={dark}>
    <main
      className={`settings-page ${dark ? "settings-dark" : "settings-light"} accent-${accent}`}
      style={
        {
          "--accent": accentColors[accent].color,
          "--accent-soft": `color-mix(in srgb, ${accentColors[accent].color} 18%, transparent)`,
        } as React.CSSProperties
      }
    >
      <aside className="settings-nav">
        <div className="settings-nav-title">
          <span>SETTINGS</span>
          <button
            className="settings-nav-back"
            onClick={onClose}
            aria-label="Back to Notes"
            data-tooltip="Back to Notes"
          >
            <Icon name="arrowLeft" size={14} />
            <span>Back</span>
          </button>
        </div>
        <label className="settings-search">
          <Icon name="search" size={16} />
          <input
            placeholder="Search settings and options"
            aria-label="Search settings and options"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <nav aria-label="Settings categories">
          {filteredCategories.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCategoryId(item.id);
                setQuery("");
              }}
              data-tooltip={item.description}
              className={`settings-nav-item ${categoryId === item.id && !normalizedQuery ? "active" : ""}`}
            >
              <span className={`settings-category-icon category-${item.color}`}>
                <Icon name={item.icon} size={17} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
          {filteredCategories.length === 0 && (
            <span className="settings-no-results">No matching settings</span>
          )}
        </nav>
        <div className="settings-nav-footer">
          <button onClick={onClose}>
            <Icon name="note" size={15} /> Back to Notes
          </button>
          <span>Scribe · Preview</span>
        </div>
      </aside>
      <section className="settings-content">
        <header className="settings-page-header">
          <div className="settings-heading-copy">
            <div className={`settings-kicker category-${activeCategory.color}`}>
              <Icon name={activeCategory.icon} size={15} />
              {normalizedQuery ? "Search results" : activeCategory.label}
            </div>
            <h1>
              {normalizedQuery
                ? `Results for “${query.trim()}”`
                : activeCategory.label}
            </h1>
            <p>
              {normalizedQuery
                ? `${searchResults.length} matching ${searchResults.length === 1 ? "setting" : "settings"} across your preferences.`
                : activeCategory.description}
            </p>
          </div>
        </header>
        <div className={`settings-content-scroll section-${activeCategory.color}`}>
          {normalizedQuery ? (
            <SettingsSearchResults
              results={searchResults}
              onOpen={openSearchResult}
            />
          ) : (
            <CategoryContent
              key={activeCategory.id}
              category={activeCategory}
              dark={dark}
              setDark={onToggleTheme}
              accent={accent}
              onAccentChange={onAccentChange}
              fontFamily={fontFamily}
              onFontFamilyChange={onFontFamilyChange}
              shortcuts={shortcuts}
              onShortcutsChange={onShortcutsChange}
              offlineMode={offlineMode}
              onOfflineModeChange={onOfflineModeChange}
              storageMetrics={storageMetrics}
              profile={profile}
              folders={folders}
              notes={notes}
              onCreateFolder={onCreateFolder}
              onEditFolder={onEditFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveFolder={onMoveFolder}
              onMoveSystemFolder={onMoveSystemFolder}
              unfiledPosition={unfiledPosition}
            />
          )}
        </div>
      </section>
    </main>
    </SettingsTooltipBoundary>
  );
}
