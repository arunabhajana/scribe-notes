import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Icon } from "../../components/Icon";
import type { FolderColor, FolderIconName, NoteFolder } from "../../types/note";

const colours: Record<FolderColor, string> = { violet: "#8b7df3", blue: "#55a3ff", mint: "#45c99a", amber: "#f2b94b", rose: "#ee789f", cyan: "#45c5d2" };

export function CaptureFolderPicker({ folders, value, disabled, onChange }: { folders: NoteFolder[]; value: string | null; disabled: boolean; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const options: Array<{ id: string | null; name: string; icon: FolderIconName; color: FolderColor }> = [{ id: null, name: "Unfiled", icon: "folder", color: "blue" }, ...folders];
  const selected = options.find((folder) => folder.id === value) ?? options[0];
  const close = (focus = true) => { setOpen(false); if (focus) trigger.current?.focus(); };
  const show = () => { setActive(Math.max(0, options.findIndex((folder) => folder.id === value))); setOpen(true); };
  useLayoutEffect(() => { if (open) buttons.current[active]?.focus(); }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={root} className="capture-folder-picker" onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close(false); }}>
    <button type="button" ref={trigger} className="capture-control" aria-label={`Save to folder: ${selected.name}`} data-tooltip={`Choose a folder · ${selected.name}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled}
      onClick={() => open ? close() : show()} onKeyDown={(event) => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); show(); } }}><span className="capture-folder-icon" style={{ color: colours[selected.color] }}><Icon name={selected.icon} size={14} /></span><span>{selected.name}</span><ChevronDown size={12} /></button>
    {open && <div className="capture-folder-menu" role="listbox" aria-label="Save to folder" id={id}>{options.map((folder, index) => <button type="button" role="option" key={folder.id ?? "unfiled"} ref={(element) => { buttons.current[index] = element; }} aria-selected={folder.id === selected.id} tabIndex={index === active ? 0 : -1}
      onClick={() => { onChange(folder.id); close(); }} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        else if (event.key === "Tab") close();
        else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); setActive(event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
        } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey) {
          const next = options.findIndex((option, i) => i > index && option.name.toLowerCase().startsWith(event.key.toLowerCase()));
          const first = options.findIndex((option) => option.name.toLowerCase().startsWith(event.key.toLowerCase()));
          if (next >= 0 || first >= 0) { event.preventDefault(); setActive(next >= 0 ? next : first); }
        }
      }}><span className="capture-folder-option"><span className="capture-folder-icon" style={{ color: colours[folder.color] }}><Icon name={folder.icon} size={14} /></span><span>{folder.name}</span></span>{folder.id === selected.id && <Check size={14} />}</button>)}</div>}
  </div>;
}
