import { useEffect, useRef } from "react";
import { Icon } from "../Icon";

export function SearchNotes({
    value,
    onChange,
    collapsed,
    onExpand,
    shortcut,
}: {
    value: string;
    onChange: (value: string) => void;
    collapsed: boolean;
    onExpand: () => void;
    shortcut: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const expandSearch = () => {
        if (collapsed) onExpand();
        requestAnimationFrame(() =>
            requestAnimationFrame(() => inputRef.current?.focus()),
        );
    };
    useEffect(() => {
        const handleSearchShortcut = () => {
            if (collapsed) onExpand();
            requestAnimationFrame(() =>
                requestAnimationFrame(() => inputRef.current?.focus()),
            );
        };
        window.addEventListener("scribe:focus-notes-search", handleSearchShortcut);
        return () =>
            window.removeEventListener(
                "scribe:focus-notes-search",
                handleSearchShortcut,
            );
    }, [collapsed, onExpand]);
    return (
        <div className="search-box" data-tour="search-notes">
            <Icon name="search" size={15} />
            <input
                ref={inputRef}
                aria-label="Search Notes"
                placeholder="Search Notes..."
                title={`Search Notes · ${shortcut}`}
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
            {value && (
                <button
                    type="button"
                    className="clear-search"
                    onClick={() => onChange("")}
                    aria-label="Clear search"
                    title="Clear search"
                >
                    <Icon name="close" size={13} />
                </button>
            )}
            {collapsed && (
                <button
                    type="button"
                    className="collapsed-search-button"
                    onClick={expandSearch}
                    aria-label="Expand sidebar to search Notes"
                    data-tooltip={`Search Notes · ${shortcut}`}
                >
                    <Icon name="search" size={17} />
                </button>
            )}
        </div>
    );
}
