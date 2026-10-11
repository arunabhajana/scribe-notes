export const shortcutActions = [
  { id: "newNote", label: "New Note", description: "Start a new Note." },
  { id: "search", label: "Search Notes", description: "Focus Note search." },
  {
    id: "allNotes",
    label: "Show all Notes",
    description: "Switch to All Notes.",
  },
  { id: "drafts", label: "Show drafts", description: "Switch to Drafts." },
  {
    id: "pinnedNotes",
    label: "Show pinned Notes",
    description: "Switch to Pinned Notes.",
  },
  { id: "trash", label: "Show trash", description: "Switch to Trash." },
  {
    id: "toggleSidebar",
    label: "Toggle sidebar",
    description: "Expand or collapse the sidebar.",
  },
  {
    id: "togglePin",
    label: "Pin selected Note",
    description: "Toggle the selected Note’s pinned state.",
  },
  {
    id: "openSettings",
    label: "Open settings",
    description: "Open the settings page.",
  },
] as const;

export type ShortcutId = (typeof shortcutActions)[number]["id"];
export type ShortcutBinding = { key: string; shift: boolean };
export type ShortcutBindings = Record<ShortcutId, ShortcutBinding>;

export const defaultShortcutBindings: ShortcutBindings = {
  newNote: { key: "n", shift: false },
  search: { key: "k", shift: false },
  allNotes: { key: "1", shift: false },
  drafts: { key: "2", shift: false },
  pinnedNotes: { key: "3", shift: false },
  trash: { key: "4", shift: false },
  toggleSidebar: { key: "b", shift: true },
  togglePin: { key: "p", shift: true },
  openSettings: { key: ",", shift: false },
};

export function getShortcutBindings(): ShortcutBindings {
  try {
    const saved = localStorage.getItem("scribe-keyboard-shortcuts");
    if (!saved) return defaultShortcutBindings;
    const parsed = JSON.parse(saved) as Partial<ShortcutBindings>;
    const bindings = Object.fromEntries(
      shortcutActions.map(({ id }) => {
        let binding = parsed[id];
        // Upgrade the previous built-in section shortcuts while preserving any
        // custom bindings a user has already chosen in Settings.
        if (id === "drafts" && binding?.key === "d" && binding.shift)
          binding = defaultShortcutBindings.drafts;
        if (id === "pinnedNotes" && binding?.key === "2" && !binding.shift)
          binding = defaultShortcutBindings.pinnedNotes;
        if (id === "trash" && binding?.key === "3" && !binding.shift)
          binding = defaultShortcutBindings.trash;
        return [
          id,
          binding &&
          typeof binding.key === "string" &&
          typeof binding.shift === "boolean"
            ? binding
            : defaultShortcutBindings[id],
        ];
      }),
    ) as ShortcutBindings;
    localStorage.setItem("scribe-keyboard-shortcuts", JSON.stringify(bindings));
    return bindings;
  } catch {
    return defaultShortcutBindings;
  }
}

export function isMacOS() {
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

export function getModifierLabel() {
  return isMacOS() ? "⌘" : "Ctrl";
}

export function getAltModifierLabel() {
  return isMacOS() ? "Option" : "Alt";
}

export function formatShortcut(binding: ShortcutBinding) {
  return `${getModifierLabel()} + ${binding.shift ? "Shift + " : ""}${binding.key === "," ? "," : binding.key.toUpperCase()}`;
}

export function matchesShortcut(
  event: KeyboardEvent,
  binding: ShortcutBinding,
) {
  const commandPressed = isMacOS() ? event.metaKey : event.ctrlKey;
  return (
    commandPressed &&
    !event.altKey &&
    event.shiftKey === binding.shift &&
    event.key.toLowerCase() === binding.key.toLowerCase()
  );
}
