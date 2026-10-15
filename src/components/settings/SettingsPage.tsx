import { SettingsTooltipBoundary } from "./SettingsTooltipBoundary";
import { AccountRequiredNotice } from "./AccountRequiredNotice";
import { pauseCaptureShortcut } from "../../features/capture/captureBridge";
import { AppLogo } from "../AppLogo";
import { MfaSettings } from "./MfaSettings";
import { SignedInDevices } from "./SignedInDevices";
import { ReminderShortcutSettings } from "./ReminderShortcutSettings";
import { scrollExpandedIntoView } from "../layout/scrollExpandedIntoView";
import type { MfaController } from "../../hooks/useMfa";
import { StatusToast } from "../feedback/LoadingFeedback";
import { CLOUD_STORAGE_CHANGED_EVENT, CLOUD_STORAGE_LIMIT_BYTES, CLOUD_STORAGE_LIMIT_MESSAGE, getCloudStorageUsage, type CloudStorageUsage } from "../../features/settings/cloudStorage";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  AlertCircle,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Globe,
  FileText,
  Folder,
  Pencil,
  Plus,
  HardDrive,
  LoaderCircle,
  ShieldCheck,
  Trash2,
  X,
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
import type { SocialProvider } from "../../hooks/useAuth";
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
    label: "Windows",
    icon: "windows",
    color: "green",
    description: "Startup, system tray, and quick capture on this device.",
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
  { label: "Launch at startup", detail: "Open Scribe when you sign in to your computer.", category: "editor", terms: "startup launch windows open boot" },
  { label: "Close to system tray", detail: "Keep Scribe running in the system tray when you close its window.", category: "editor", terms: "close minimize tray notification area hide background" },
  { label: "Cloud sync", detail: "Choose whether this device uploads and downloads notes.", category: "general", terms: "offline network internet sync pause local enable disable cloud" },
  { label: "Dark appearance", detail: "Use the Midnight dark theme.", category: "appearance", terms: "theme night midnight dark", targetId: "setting-color-mood" },
  { label: "Light appearance", detail: "Use the Daylight light theme.", category: "appearance", terms: "theme day daylight light", targetId: "setting-color-mood" },
  { label: "Accent color", detail: "Choose the accent used throughout Scribe.", category: "appearance", terms: "colour color swatches accent" },
  { label: "Font family", detail: "Choose the typeface for Note content.", category: "appearance", terms: "typography font typeface georgia monospace dm sans" },
  { label: "Text size", detail: "Adjust Note text size.", category: "appearance", terms: "typography font size small medium large" },
  { label: "Quick capture", detail: "Capture notes from any app with a global shortcut.", category: "editor", terms: "windows global hotkey capture overlay background enable disable" },
  { label: "Spell check", detail: "Underline possible spelling mistakes as you type.", category: "editor", terms: "spelling writing proofread" },
  { label: "Desktop notifications", detail: "Save your desktop alert preference.", category: "notifications", terms: "desktop notification alerts enable disable" },
  { label: "Sounds", detail: "Save your sound preference for app interactions.", category: "notifications", terms: "audio sound notification mute" },
  { label: "Note reminders", detail: "Choose whether to receive alerts for note reminders.", category: "notifications", terms: "reminder notification alert scheduled" },
  { label: "Remind me before", detail: "Choose when to receive an extra alert before a reminder is due.", category: "notifications", terms: "lead advance early before minutes time 5 10 15 30 60" },
  { label: "Reminder Presets", detail: "Choose a default reminder and manage custom presets saved locally.", category: "notifications", terms: "custom shortcut preset default quick time duration minutes hours days edit delete" },
  { label: "Keyboard shortcuts", detail: "Customize app shortcuts or restore their defaults.", category: "shortcuts", terms: "keys keyboard hotkey commands bindings reset formatting" },
  { label: "Local storage", detail: "View estimated local Notes, folders, and preferences usage.", category: "storage", terms: "device disk usage chart pie donut local offline", targetId: "setting-local-storage" },
  { label: "Cloud storage", detail: "View server storage usage against your 2 MB limit.", category: "storage", terms: "cloud quota limit capacity usage chart pie donut 2mb" },
  { label: "Folder organization", detail: "Reorder, rename, recolor, or delete your folders.", category: "folders", terms: "organize folders reorder rename delete icon color unfiled", targetId: "setting-manage-folders" },
  { label: "Avatar color", detail: "Choose a color for your profile initials.", category: "account", terms: "avatar profile color initials", targetId: "setting-display-name" },
  { label: "Display name", detail: "Change the name shown across Scribe and saved to your account.", category: "account", terms: "username profile name", targetId: "setting-display-name" },
  { label: "Email address", detail: "View the email address associated with your account; it cannot be changed here.", category: "account", terms: "email login address", targetId: "setting-display-name" },
  { label: "Password & security", detail: "Review account security controls.", category: "account", terms: "security password verification" },
  { label: "Reset password", detail: "Password reset controls are coming soon.", category: "account", terms: "password reset recovery" },
  { label: "Two-step verification", detail: "Protect sign-in with Authy or another authenticator app.", category: "account", terms: "2fa mfa two factor authentication security" },
  { label: "Linked accounts", detail: "Link or unlink Google and GitHub sign-in providers.", category: "account", terms: "social provider google github link unlink connected" },
  { label: "Signed-in devices", detail: "View the signed-in sessions associated with your account.", category: "account", terms: "sessions devices windows android mobile chrome pc sign out logout" },
  { label: "Sign out from all devices", detail: "End every sign-in session, including this device.", category: "account", terms: "all sessions logout sign out revoke", targetId: "setting-signed-in-devices" },
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
  disabled = false,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  color?: string;
  disabled?: boolean;
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
        disabled={disabled}
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
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const selected = menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (selected) scrollExpandedIntoView(selected);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, value]);
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

function StorageSettings({ metrics, cloudSyncEnabled, localOnly, onSignIn }: { metrics: StorageMetrics; cloudSyncEnabled: boolean; localOnly?: boolean; onSignIn: () => void }) {
  const [usage, setUsage] = useState<CloudStorageUsage | null>(null);
  const [cloudError, setCloudError] = useState("");
  const [cloudLoading, setCloudLoading] = useState(true);
  useEffect(() => {
    if (localOnly) return;
    let active = true;
    let request = 0;
    const refresh = () => {
      const id = ++request;
      setCloudLoading(true);
      void getCloudStorageUsage().then((result) => {
        if (!active || id !== request) return;
        setUsage(result);
        setCloudError("");
      }).catch((error: unknown) => {
        if (active && id === request) setCloudError(error instanceof Error ? error.message : "Cloud usage is unavailable.");
      }).finally(() => {
        if (active && id === request) setCloudLoading(false);
      });
    };
    refresh();
    window.addEventListener(CLOUD_STORAGE_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      window.removeEventListener(CLOUD_STORAGE_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [localOnly]);
  const local = metrics.noteBytes + metrics.folderBytes + metrics.settingsBytes;
  const cloud = usage?.usedBytes ?? 0;
  const limit = usage?.limitBytes ?? CLOUD_STORAGE_LIMIT_BYTES;
  const percent = Math.min(100, cloud / limit * 100);
  const noteShare = local ? metrics.noteBytes / local * 100 : 0;
  const folderShare = local ? metrics.folderBytes / local * 100 : 0;
  return <>
    {localOnly ? <SettingCard title="Cloud storage" description="Offline profiles do not upload data or use cloud storage." accent="purple"><AccountRequiredNotice onSignIn={onSignIn} /></SettingCard> : <>
    <div className={cloudSyncEnabled ? "" : "cloud-storage-disabled"}>
    <SettingCard title="Cloud storage" description="2 MB per account for synced Notes, folders, and reminders." accent="purple" id={settingId("Cloud storage")}>
      {!cloudSyncEnabled && <div className="cloud-sync-disabled-banner"><strong>Cloud sync is disabled</strong>Usage shows data already stored in your account. New changes stay on this device. Enable sync in General settings.</div>}
      <div className="storage-chart-layout">
        <div className="settings-donut" role="img" aria-label={usage ? `Cloud usage ${formatBytes(cloud)} of 2 MB` : "Loading cloud usage"} style={{ background: `conic-gradient(var(--category) ${percent}%, var(--border) 0)` }}><div><Cloud size={22} /><strong>{usage ? `${percent.toFixed(1)}%` : "—"}</strong><small>used</small></div></div>
        <div className="storage-chart-copy"><strong>{usage ? formatBytes(cloud) : "—"} <span>/ 2 MB</span></strong><p>{cloudLoading ? "Checking cloud usage…" : usage ? `${formatBytes(Math.max(0, limit - cloud))} remaining` : "Cloud usage unavailable"}</p><small>Includes formatting, Drafts and Trash. Cloud sizes may be larger than local estimates.</small></div>
      </div>
      <div className="storage-detail-row"><FileText size={16} /><span>Notes</span><strong>{usage ? formatBytes(usage.noteBytes) : "—"}</strong></div>
      <div className="storage-detail-row"><Folder size={16} /><span>Folders</span><strong>{usage ? formatBytes(usage.folderBytes) : "—"}</strong></div>
      <div className="storage-detail-row"><Bell size={16} /><span>Reminders</span><strong>{usage ? formatBytes(usage.reminderBytes ?? 0) : "—"}</strong></div>
      {cloudError && <p role="alert" className="settings-inline-error">{cloudError}</p>}
      {cloudSyncEnabled && usage && cloud >= limit && <p className="settings-info-banner">Cloud storage limit reached. Permanently delete unwanted Notes or shorten their content to free space. Local changes remain saved.</p>}
    </SettingCard>
    </div>
    {cloudSyncEnabled && usage && cloud > limit && <div className="status-toast-stack"><StatusToast message={CLOUD_STORAGE_LIMIT_MESSAGE} /></div>}
    </>}
    <SettingCard title="On this device" description="No app storage limit. Uses available space on your device." accent="purple" id={settingId("Local storage")}>
      <div className="storage-chart-layout">
        <div className="settings-donut" role="img" aria-label={`Local content ${formatBytes(local)}`} style={{ background: local ? `conic-gradient(var(--category) ${noteShare}%, #25bfd1 ${noteShare}% ${noteShare + folderShare}%, #f6a623 0)` : 'var(--border)' }}><div><HardDrive size={22} /><strong>{formatBytes(local)}</strong><small>local content</small></div></div>
        <div className="storage-chart-copy"><strong>{metrics.noteCount} Notes · {metrics.folderCount} folders</strong><p>Saved on this device.</p><small>Estimated size of your notes, folders and preferences. May differ from cloud usage.</small></div>
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

function AccountSettings({
  profile,
  onSignIn,
  onAvatarColorChange,
  onUpdateDisplayName,
  onLinkAccount,
  onUnlinkAccount,
  onRequestPasswordReset,
  mfa,
}: {
  profile: AccountProfile;
  onSignIn: () => void;
  onAvatarColorChange: (color: string) => void;
  onUpdateDisplayName: (name: string) => Promise<string | null>;
  onLinkAccount: (provider: SocialProvider) => Promise<string | null>;
  onUnlinkAccount: (provider: SocialProvider) => Promise<string | null>;
  onRequestPasswordReset: (email: string) => Promise<string | null>;
  mfa: MfaController;
}) {
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(profile.displayName);
  const [savingName, setSavingName] = useState(false);
  const [requestingPasswordReset, setRequestingPasswordReset] = useState(false);
  const [linkStartedProvider, setLinkStartedProvider] = useState<SocialProvider | null>(null);
  const [accountToast, setAccountToast] = useState<{ message: string; kind: "success" | "error" | "info" } | null>(null);
  const initials = profile.displayName.trim().charAt(0).toUpperCase() || "A";

  function showAccountToast(message: string, kind: "success" | "error" | "info") {
    setAccountToast({ message, kind });
  }

  async function saveDisplayName() {
    const name = displayNameDraft.trim();
    if (!name || name.length > 60) {
      showAccountToast("Enter a name between 1 and 60 characters.", "error");
      return;
    }
    setSavingName(true);
    try {
      const error = await onUpdateDisplayName(name);
      if (error) {
        showAccountToast(error, "error");
        return;
      }
      setDisplayNameDraft(name);
      setEditingName(false);
      showAccountToast("Display name updated.", "success");
    } catch (error) {
      showAccountToast(error instanceof Error ? error.message : "Could not update your display name.", "error");
    } finally {
      setSavingName(false);
    }
  }

  async function requestPasswordReset() {
    setRequestingPasswordReset(true);
    try {
      const error = await onRequestPasswordReset(profile.email);
      if (error) showAccountToast(error, "error");
      else showAccountToast("If an account exists for this email, a password reset link is on its way.", "success");
    } catch {
      showAccountToast("Could not send the reset email. Check your connection and try again.", "error");
    } finally {
      setRequestingPasswordReset(false);
    }
  }

  useEffect(() => {
    if (!linkStartedProvider || !profile.linkedAccounts?.some((item) => item.provider === linkStartedProvider)) return;
    const timer = window.setTimeout(() => {
      setAccountToast({
        message: `${linkStartedProvider === "google" ? "Google" : "GitHub"} account linked.`,
        kind: "success",
      });
      setLinkStartedProvider(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [linkStartedProvider, profile.linkedAccounts]);

  useEffect(() => {
    if (!accountToast) return;
    const timeout = window.setTimeout(() => setAccountToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [accountToast]);

  async function toggleProvider(provider: SocialProvider, isLinked: boolean) {
    setPendingProvider(provider);
    setAccountToast(null);
    if (isLinked) setLinkStartedProvider(null);
    try {
      const error = await (isLinked ? onUnlinkAccount(provider) : onLinkAccount(provider));
      if (error) {
        setLinkStartedProvider(null);
        showAccountToast(error, "error");
      } else if (isLinked) {
        showAccountToast(`${provider === "google" ? "Google" : "GitHub"} account unlinked.`, "success");
      } else {
        setLinkStartedProvider(provider);
        showAccountToast(`Continue in your browser to finish linking ${provider === "google" ? "Google" : "GitHub"}.`, "info");
      }
    } catch (error) {
      setLinkStartedProvider(null);
      showAccountToast(error instanceof Error ? error.message : "Could not update this linked account.", "error");
    } finally {
      setPendingProvider(null);
    }
  }
  return (
    <>
      <SettingCard
        title="Your profile"
        description={profile.localOnly ? "Your name and avatar color are saved only on this device." : "Personalize the name and initials shown in Scribe."}
        accent="pink"
        id={settingId("Display name")}
      >
        <div className="account-profile-card">
          <div className="account-profile-avatar" style={{ backgroundColor: profile.avatarColor ?? "#8970ed" }}>
            {initials}
          </div>
          <div className={`account-profile-copy ${editingName ? "is-editing" : ""}`}>
            {editingName ? (
              <div className="account-display-name-editor">
                <input
                  autoFocus
                  aria-label="Display name"
                  maxLength={60}
                  value={displayNameDraft}
                  disabled={savingName}
                  onChange={(event) => setDisplayNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") { event.preventDefault(); void saveDisplayName(); }
                    if (event.key === "Escape") { setDisplayNameDraft(profile.displayName); setEditingName(false); }
                  }}
                />
                <button type="button" className="account-name-save" aria-label="Save display name" disabled={savingName} onClick={() => void saveDisplayName()}><Check size={14} /></button>
                <button type="button" className="account-name-cancel" aria-label="Cancel display name edit" disabled={savingName} onClick={() => { setDisplayNameDraft(profile.displayName); setEditingName(false); }}><X size={14} /></button>
              </div>
            ) : (
              <div className="account-profile-name-line">
                <strong>{profile.displayName}</strong>
                <button type="button" aria-label="Edit display name" onClick={() => { setDisplayNameDraft(profile.displayName); setEditingName(true); }}>Edit</button>
              </div>
            )}
            {!profile.localOnly && <span>{profile.email}</span>}
          </div>
        </div>
        <div className="account-avatar-color-row">
          <div><strong>Avatar color</strong><small>Choose a color for your initials.</small></div>
          <div className="account-avatar-color-options" role="radiogroup" aria-label="Avatar color">
            {[
              { name: "Violet", value: "#8970ed" },
              { name: "Blue", value: "#379be9" },
              { name: "Green", value: "#22b893" },
              { name: "Orange", value: "#e7a642" },
              { name: "Pink", value: "#df69a2" },
              { name: "Cyan", value: "#20bfcc" },
            ].map(({ name, value }) => (
              <button
                key={value}
                type="button"
                className={`account-avatar-color ${profile.avatarColor === value ? "is-selected" : ""}`}
                style={{ backgroundColor: value }}
                aria-pressed={profile.avatarColor === value}
                aria-label={`${name} avatar color`}
                title={name}
                onClick={() => onAvatarColorChange(value)}
              />
            ))}
          </div>
        </div>
      </SettingCard>
      {profile.localOnly ? <>
        <AccountRequiredNotice onSignIn={onSignIn} />
        <SettingCard title="Account features" description="These features need a signed-in account." accent="pink">
          <fieldset disabled className="offline-account-features">{["Email address", "Password reset", "Two-step verification", "Google & GitHub linking", "Signed-in devices", "Export account data", "Delete Data", "Delete account"].map(label => <div className="offline-account-feature" key={label}><span>{label}</span><button type="button">Sign in required</button></div>)}</fieldset>
        </SettingCard>
        {accountToast && <div className="status-toast-stack"><div className={`status-toast is-${accountToast.kind}`} role="status"><span>{accountToast.message}</span><button type="button" aria-label="Dismiss notification" onClick={() => setAccountToast(null)}><X size={15} /></button></div></div>}
      </> : <>
      <SettingCard
        title="Password & security"
        description="Manage your password and add an authenticator for extra sign-in protection."
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
        <div className="account-setting-row" id={settingId("Reset password")}>
          <div>
            <strong>Reset password</strong>
            <span>Send a password reset link to {profile.email}.</span>
          </div>
          <button
            type="button"
            className="account-reset-button"
            data-tooltip="Email a secure link to reset your Scribe password"
            disabled={requestingPasswordReset}
            onClick={() => void requestPasswordReset()}
          >
            {requestingPasswordReset ? "Sending…" : "Send reset link"}
            {requestingPasswordReset && <LoaderCircle size={15} className="spin" />}
          </button>
        </div>
        <div id={settingId("Two-step verification")}><MfaSettings mfa={mfa} /></div>
      </SettingCard>
      <SettingCard title="Linked accounts" id={settingId("Linked accounts")} description="Connect Google or GitHub to this Scribe account." accent="pink">
        {(["google", "github"] as const).map((provider) => {
          const identity = profile.linkedAccounts?.find((item) => item.provider === provider);
          const identitiesLoaded = profile.linkedAccountsLoaded !== false;
          const cannotUnlink = Boolean(identity) && (profile.linkedIdentityCount ?? 0) <= 1;
          return (
            <div className="account-connection-row" key={provider}>
              <div className="account-icon-tile"><ProviderLogo provider={provider} /></div>
              <div className="account-connection-info">
                <strong>{provider === "google" ? "Google" : "GitHub"}</strong>
                {identity?.name && <span>{identity.name}</span>}
                {identity?.email && <span>{identity.email}</span>}
                <small className={identity ? "connection-status-linked" : ""}>{!identitiesLoaded ? profile.linkedAccountsError ? "Could not check linked providers. Reopen Settings to retry." : "Checking connected providers…" : identity ? "Linked to your account" : "No account linked"}</small>
              </div>
              <button
                type="button"
                className={`account-preview-action ${identity ? "action-danger" : "action-link"}`}
                disabled={pendingProvider !== null || !identitiesLoaded || cannotUnlink}
                title={cannotUnlink ? "Keep at least one sign-in method linked." : undefined}
                onClick={() => void toggleProvider(provider, Boolean(identity))}
              >
                {pendingProvider === provider ? "Working…" : !identitiesLoaded ? "Checking…" : identity ? "Unlink" : "Link"}
              </button>
            </div>
          );
        })}
      </SettingCard>
      {accountToast && (
        <div className="status-toast-stack">
          <div className={`status-toast is-${accountToast.kind}`} role={accountToast.kind === "error" ? "alert" : "status"} aria-live={accountToast.kind === "error" ? "assertive" : "polite"}>
            <span className="status-toast-icon">{accountToast.kind === "success" ? <Check size={18} /> : accountToast.kind === "error" ? <AlertCircle size={18} /> : <Globe size={18} />}</span>
            <span>{accountToast.message}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => setAccountToast(null)}><X size={15} /></button>
          </div>
        </div>
      )}
      <SettingCard title="Signed-in devices" id={settingId("Signed-in devices")} description="Sign-in sessions associated with your account." accent="pink">
        <SignedInDevices inventory={profile.deviceInventory} />
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
      </>}
    </>
  );
}

function KeyboardShortcutSettings({
  shortcuts,
  onChange,
}: {
  shortcuts: ShortcutBindings;
  onChange: (value: ShortcutBindings) => Promise<void>;
}) {
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [error, setError] = useState("");
  const applying = useRef(false);
  useEffect(() => {
    if (!recording) return;
    let disposed = false;
    let paused = false;
    void pauseCaptureShortcut(true).then(() => { paused = true; }).catch(() => {
      if (!disposed) setError("Could not pause the global shortcut for recording. Try again.");
    });
    const capture = async (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRecording(null);
        setError("");
        return;
      }
      const command = isMacOS() ? event.metaKey : event.ctrlKey;
      if (!command || event.altKey || event.key.length !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      if (!paused || applying.current) return;
      const key = event.key.toLowerCase();
      if ((key === "b" || key === "i" || key === "u") && !event.shiftKey) {
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
      try {
        applying.current = true;
        await onChange({ ...shortcuts, [recording]: { key, shift: event.shiftKey } });
        setRecording((current) => current === recording ? null : current); setError("");
      } catch (cause) {
        if (!disposed) setError(typeof cause === "string" ? cause : "Could not save this shortcut. Try another combination.");
      } finally { applying.current = false; }
    };
    window.addEventListener("keydown", capture, true);
    return () => {
      disposed = true;
      window.removeEventListener("keydown", capture, true);
      void pauseCaptureShortcut(false).catch((cause: unknown) => {
        window.dispatchEvent(new CustomEvent("scribe:capture-shortcut-error", { detail: typeof cause === "string" ? cause : "Quick capture could not restore its shortcut. Choose another in Settings." }));
      });
    };
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
          void onChange(defaultShortcutBindings).catch((cause: unknown) => setError(typeof cause === "string" ? cause : "Could not restore shortcuts. Try again."));
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
  onSignIn,
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
  onAvatarColorChange,
  onUpdateDisplayName,
  onLinkAccount,
  onUnlinkAccount,
  onRequestPasswordReset,
  mfa,
  onLaunchAtStartupChange,
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
  onSignIn: () => void;
  dark: boolean;
  setDark: (value: boolean) => void;
  accent: AccentColor;
  onAccentChange: (value: AccentColor) => void;
  fontFamily: string;
  onFontFamilyChange: (value: string) => void;
  shortcuts: ShortcutBindings;
  onShortcutsChange: (value: ShortcutBindings) => Promise<void>;
  offlineMode: boolean;
  onOfflineModeChange: (enabled: boolean) => void;
  storageMetrics: StorageMetrics;
  profile: AccountProfile;
  onAvatarColorChange: (color: string) => void;
  onUpdateDisplayName: (name: string) => Promise<string | null>;
  onLinkAccount: (provider: SocialProvider) => Promise<string | null>;
  onUnlinkAccount: (provider: SocialProvider) => Promise<string | null>;
  onRequestPasswordReset: (email: string) => Promise<string | null>;
  mfa: MfaController;
  onLaunchAtStartupChange: (enabled: boolean) => Promise<string | null>;
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
  const [startupPending, setStartupPending] = useState(false);
  const [startupError, setStartupError] = useState("");
  const toggles = preferences;
  const values = { size: preferences.size };
  const toggle = (key: "minimizeToTray" | "quickCapture" | "spellcheck" | "reminders" | "desktop" | "sounds") => (value: boolean) => updatePreferences({ [key]: value });
  const changeLaunchAtStartup = async (enabled: boolean) => {
    setStartupPending(true);
    setStartupError("");
    try {
      const error = await onLaunchAtStartupChange(enabled);
      if (error) setStartupError(error);
      else updatePreferences({ launch: enabled });
    } catch {
      setStartupError("Could not update the startup setting. Please try again.");
    } finally {
      setStartupPending(false);
    }
  };
  const change = (key: "size" | "reminderLead") => (value: string) => updatePreferences({ [key]: value });
  switch (category.id) {
    case "general":
      return (
        <>
          <SettingCard
            title="Cloud sync"
            description="Optional. Off by default for this account on this device."
            accent="blue"
          >
            {profile.localOnly && <AccountRequiredNotice onSignIn={onSignIn} detail="Sign in to sync notes across devices. Your offline profile and notes stay on this device." />}
            <fieldset disabled={profile.localOnly} className={`offline-account-features${profile.localOnly ? " offline-feature-switch" : ""}`}>
            <SettingToggle
              label="Cloud sync"
              detail="Sync notes, folders and reminders with your account. Review what is uploaded before enabling."
              checked={!offlineMode}
              onChange={(enabled) => onOfflineModeChange(!enabled)}
              color="blue"
            />
            </fieldset>
          </SettingCard>
        </>
      );
    case "account":
      return <AccountSettings profile={profile} onSignIn={onSignIn} onAvatarColorChange={onAvatarColorChange} onUpdateDisplayName={onUpdateDisplayName} onLinkAccount={onLinkAccount} onUnlinkAccount={onUnlinkAccount} onRequestPasswordReset={onRequestPasswordReset} mfa={mfa} />;
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
          <SettingCard title="Windows integration" description="Control startup and background capture." accent="green">
            <SettingToggle
              label="Launch at startup"
              detail="Open Scribe when you sign in to your computer."
              checked={toggles.launch}
              onChange={(value) => void changeLaunchAtStartup(value)}
              color="blue"
              disabled={startupPending}
            />
            {startupError && <p role="alert" className="settings-inline-error">{startupError}</p>}
            <SettingToggle
              label="Close to system tray"
              detail="Keep Scribe running in the system tray when you close its window. Open or quit Scribe from the tray icon."
              checked={toggles.minimizeToTray}
              onChange={toggle("minimizeToTray")}
              color="blue"
            />
            <SettingToggle label="Quick capture" detail={`Capture notes from any app with ${formatShortcut(shortcuts.quickCapture)} while Scribe is running. Change the binding in Shortcuts.`} checked={toggles.quickCapture} onChange={toggle("quickCapture")} color="green" />
          </SettingCard>
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
              detail="Choose whether to receive alerts for note reminders."
              checked={toggles.reminders}
              onChange={toggle("reminders")}
              color="amber"
            />
            <SettingToggle
              label="Desktop notifications"
              detail="Show reminders while Scribe is in the background, and sync errors that persist for two minutes."
              checked={toggles.desktop}
              onChange={toggle("desktop")}
              color="amber"
            />
            <SettingSelect label="Remind me before" detail="An extra alert before the scheduled time. The reminder still alerts when due. Applies to new reminders; you can change it for each note." value={preferences.reminderLead} options={["At the time", "5 minutes", "10 minutes", "15 minutes", "30 minutes", "60 minutes"]} onChange={change("reminderLead")} />
            <SettingToggle
              label="Sounds"
              detail="Play reminder and quick capture sounds, including while Scribe is minimized or in the tray. Sync feedback stays quiet."
              checked={toggles.sounds}
              onChange={toggle("sounds")}
              color="amber"
            />
          </SettingCard>
          <SettingCard title="Reminder Presets" description="Choose your default and manage custom reminder times." accent="amber">
            <ReminderShortcutSettings />
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
      return <StorageSettings metrics={storageMetrics} cloudSyncEnabled={!offlineMode} localOnly={profile.localOnly} onSignIn={onSignIn} />;
    default:
      return (
        <>
          <SettingCard
            title="Scribe"
            description="A quiet place for everything on your mind."
            accent="pink"
          >
            <div className="about-mark">
              <AppLogo variant="transparent" />
              <div>
                <strong>Scribe for Windows</strong>
                <span>Version {import.meta.env.VITE_APP_VERSION} · Preview</span>
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
  onSignIn,
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
  onAvatarColorChange,
  onUpdateDisplayName,
  onLinkAccount,
  onUnlinkAccount,
  onRequestPasswordReset,
  mfa,
  onLaunchAtStartupChange,
  folders,
  notes,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onMoveFolder,
  onMoveSystemFolder,
  unfiledPosition,
}: {
  onSignIn: () => void;
  dark: boolean;
  accent: AccentColor;
  onAccentChange: (value: AccentColor) => void;
  fontFamily: string;
  onFontFamilyChange: (value: string) => void;
  onToggleTheme: (value: boolean) => void;
  onClose: () => void;
  shortcuts: ShortcutBindings;
  onShortcutsChange: (value: ShortcutBindings) => Promise<void>;
  offlineMode: boolean;
  onOfflineModeChange: (enabled: boolean) => void;
  storageMetrics: StorageMetrics;
  profile: AccountProfile;
  onAvatarColorChange: (color: string) => void;
  onUpdateDisplayName: (name: string) => Promise<string | null>;
  onLinkAccount: (provider: SocialProvider) => Promise<string | null>;
  onUnlinkAccount: (provider: SocialProvider) => Promise<string | null>;
  onRequestPasswordReset: (email: string) => Promise<string | null>;
  mfa: MfaController;
  onLaunchAtStartupChange: (enabled: boolean) => Promise<string | null>;
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
          if (target) scrollExpandedIntoView(target);
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
              onSignIn={onSignIn}
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
              onAvatarColorChange={onAvatarColorChange}
              onUpdateDisplayName={onUpdateDisplayName}
              onLinkAccount={onLinkAccount}
              onUnlinkAccount={onUnlinkAccount}
              onRequestPasswordReset={onRequestPasswordReset}
              mfa={mfa}
              onLaunchAtStartupChange={onLaunchAtStartupChange}
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
