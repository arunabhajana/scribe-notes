import { AppLogo } from "../AppLogo";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function BrandHeader({
    collapsed,
    onToggleCollapsed,
    shortcut,
}: {
    collapsed: boolean;
    onToggleCollapsed: () => void;
    shortcut: string;
}) {
    return (
        <div className={`brand-row ${collapsed ? "is-collapsed" : ""}`}>
            <AppLogo variant="transparent" />
            <span className="brand-name">Scribe</span>
            <button
                className="icon-button collapse-sidebar-button"
                onClick={onToggleCollapsed}
                data-tooltip={`${collapsed ? "Expand sidebar" : "Collapse sidebar"} · ${shortcut}`}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
        </div>
    );
}
