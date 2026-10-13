import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { scrollExpandedIntoView } from "../layout/scrollExpandedIntoView";
import { Icon } from "../Icon";
import type { FolderColor, FolderIconName, NoteFolder } from "../../types/note";

const folderIcons: { id: FolderIconName; label: string }[] = [
  { id: "folder", label: "Folder" },
  { id: "briefcase", label: "Work" },
  { id: "book", label: "Reading" },
  { id: "idea", label: "Ideas" },
  { id: "heart", label: "Personal" },
  { id: "code", label: "Code" },
  { id: "star", label: "Favorites" },
  { id: "travel", label: "Travel" },
  { id: "music", label: "Music" },
];
const folderColors: { id: FolderColor; label: string; hex: string }[] = [
  { id: "violet", label: "Violet", hex: "#8b7df3" },
  { id: "blue", label: "Blue", hex: "#55a3ff" },
  { id: "mint", label: "Mint", hex: "#45c99a" },
  { id: "amber", label: "Amber", hex: "#f2b94b" },
  { id: "rose", label: "Rose", hex: "#ee789f" },
  { id: "cyan", label: "Cyan", hex: "#45c5d2" },
];

export function CreateFolderDialog({
  onClose,
  onCreate,
  folder,
  onEdit,
}: {
  onClose: () => void;
  onCreate: (name: string, icon: FolderIconName, color: FolderColor) => boolean;
  folder?: NoteFolder;
  onEdit?: (
    currentId: string,
    name: string,
    icon: FolderIconName,
    color: FolderColor,
  ) => boolean;
}) {
  const [name, setName] = useState(folder?.name ?? "");
  const [icon, setIcon] = useState<FolderIconName>(folder?.icon ?? "folder");
  const [color, setColor] = useState<FolderColor>(folder?.color ?? "violet");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const picker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const frame = requestAnimationFrame(() => { if (picker.current) scrollExpandedIntoView(picker.current); });
    return () => cancelAnimationFrame(frame);
  }, [pickerOpen]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    const saved =
      folder && onEdit
        ? onEdit(folder.id, name, icon, color)
        : onCreate(name, icon, color);
    if (!saved) {
      setError("A folder with that name already exists.");
      return;
    }
    onClose();
  };
  const closeOnBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };
  return (
    <div className="modal-backdrop" onMouseDown={closeOnBackdrop}>
      <form className="folder-modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <h2>{folder ? "Edit folder" : "Create a folder"}</h2>
            <p>Keep related Notes together.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <label className="folder-label" htmlFor="folder-name">
          Folder name
        </label>
        <input
          id="folder-name"
          autoFocus
          className="folder-input"
          placeholder="e.g. Projects"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError("");
          }}
        />
        {error && <span className="folder-error" role="alert">{error}</span>}
        <div className="folder-customize">
          <div>
            <strong>Make it yours</strong>
            <span>Choose an icon and color</span>
          </div>
          <button
            type="button"
            className={`folder-style-trigger folder-tone-${color}`}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
          >
            <span className="folder-style-preview">
              <Icon name={icon} size={17} />
            </span>
            <span>
              {folderColors.find((option) => option.id === color)?.label}
            </span>
            <Icon name="chevronDown" size={14} />
          </button>
        </div>
        {pickerOpen && (
          <div ref={picker} className="folder-picker">
            <div className="folder-picker-label">ICON</div>
            <div className="folder-icon-grid">
              {folderIcons.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  title={option.label}
                  aria-label={option.label}
                  className={`folder-choice-icon ${icon === option.id ? "selected" : ""} folder-tone-${color}`}
                  onClick={() => setIcon(option.id)}
                >
                  <Icon name={option.id} size={17} />
                </button>
              ))}
            </div>
            <div className="folder-picker-label color-label">COLOR</div>
            <div className="folder-color-grid">
              {folderColors.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={`folder-choice-color ${color === option.id ? "selected" : ""}`}
                  style={
                    { "--folder-swatch": option.hex } as React.CSSProperties
                  }
                  onClick={() => setColor(option.id)}
                  title={option.label}
                  aria-label={`${option.label} folder color`}
                >
                  {color === option.id && <Icon name="check" size={13} />}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="cancel-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="new-note-button">
            {folder ? "Save changes" : "Create folder"}
          </button>
        </div>
      </form>
    </div>
  );
}
