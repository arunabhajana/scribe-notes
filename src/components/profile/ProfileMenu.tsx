import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import type { AccountProfile } from "../../features/auth/accountProfile";

export function ProfileMenu({
    onOpenPreferences,
    onLogout,
    collapsed,
    profile,
}: {
    onOpenPreferences: () => void;
    onLogout: () => void;
    collapsed: boolean;
    profile: AccountProfile;
}) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const initials = profile.displayName.trim().charAt(0).toUpperCase() || "A";

    useEffect(() => {
        if (!open) return;
        const closeOnPointerDown = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", closeOnPointerDown);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnPointerDown);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [open]);

    return (
        <div className="profile-menu-wrap" ref={menuRef}>
            <button
                className={`icon-button profile-menu ${collapsed ? "profile-menu-avatar" : ""}`}
                aria-label="Account menu"
                data-tooltip="Account menu"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
            >
                {collapsed ? (
                    <span className="avatar" style={{ background: profile.avatarColor, color: "#fff" }}>{initials}</span>
                ) : (
                    <span className="profile-menu-dots" aria-hidden="true">
                        ···
                    </span>
                )}
            </button>
            {open && (
                <div
                    className={`profile-popover ${collapsed ? "profile-popover-collapsed" : ""}`}
                    role="menu"
                >
                    <div className="profile-popover-user">
                        <div className="avatar" style={{ background: profile.avatarColor, color: "#fff" }}>{initials}</div>
                        <div>
                            <strong>{profile.displayName}</strong>
                            {!profile.localOnly && <span>{profile.email}</span>}
                        </div>
                    </div>
                    <div className="profile-popover-divider" />
                    <button
                        role="menuitem"
                        onClick={() => {
                            setOpen(false);
                            onOpenPreferences();
                        }}
                    >
                        <Icon name="sun" size={15} /> Settings
                    </button>
                    <div className="profile-popover-divider menu-divider-bottom" />
                    <button
                        className={profile.localOnly ? "" : "logout-menu-item"}
                        role="menuitem"
                        onClick={() => {
                            setOpen(false);
                            onLogout();
                        }}
                    >
                        <Icon name="logout" size={15} /> {profile.localOnly ? "Sign in to an account" : "Log out"}
                    </button>
                </div>
            )}
        </div>
    );
}

export function ProfileBar({
    onOpenPreferences,
    onLogout,
    collapsed,
    profile,
}: {
    onOpenPreferences: () => void;
    onLogout: () => void;
    collapsed: boolean;
    profile: AccountProfile;
}) {
    const initials = profile.displayName.trim().charAt(0).toUpperCase() || "A";
    return (
        <div className={`profile-row ${collapsed ? "is-collapsed" : ""}`}>
            <div className="avatar profile-avatar" style={{ background: profile.avatarColor, color: "#fff" }}>{initials}</div>
            <div className="profile-copy">
                <span className="profile-name">{profile.displayName}</span>
                {!profile.localOnly && <span className="profile-plan">{profile.email}</span>}
            </div>
            <ProfileMenu
                collapsed={collapsed}
                profile={profile}
                onOpenPreferences={onOpenPreferences}
                onLogout={onLogout}
            />
        </div>
    );
}
