import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowDownWideNarrow, Check, ChevronDown } from "lucide-react";
import { noteSortOptions, type NoteSort } from "../../features/notes/noteSorting";

export function NoteSortDropdown({ value, onChange }: { value: NoteSort; onChange: (value: NoteSort) => void }) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const selected = noteSortOptions.find((option) => option.value === value) ?? noteSortOptions[0];

  function show(last = false) {
    const rect = trigger.current?.getBoundingClientRect();
    setAbove(Boolean(rect && window.innerHeight - rect.bottom < 245 && rect.top > 245));
    setActive(last ? noteSortOptions.length - 1 : Math.max(0, noteSortOptions.findIndex((option) => option.value === value)));
    setOpen(true);
  }
  function close() { setOpen(false); trigger.current?.focus(); }
  useLayoutEffect(() => { if (open) options.current[active]?.focus(); }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div ref={root} className="note-sort-dropdown" onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <button ref={trigger} type="button" className={`note-sort-trigger${open ? " is-open" : ""}`}
        aria-label={`Sort notes: ${selected.label}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => open ? close() : show()} onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(event.key === "ArrowUp"); }
        }}>
        <ArrowDownWideNarrow size={14} /><span>{selected.label}</span><ChevronDown size={13} className="note-sort-chevron" />
      </button>
      {open && <div id={menuId} role="listbox" aria-label="Sort notes" className={`note-sort-menu${above ? " opens-above" : ""}`}>
        {noteSortOptions.map((option, index) => (
          <button key={option.value} ref={(element) => { options.current[index] = element; }} type="button" role="option"
            aria-selected={option.value === value} tabIndex={index === active ? 0 : -1}
            onClick={() => { onChange(option.value); close(); }} onKeyDown={(event) => {
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
              else if (event.key === "Tab") close();
              else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                setActive(event.key === "Home" ? 0 : event.key === "End" ? noteSortOptions.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + noteSortOptions.length) % noteSortOptions.length);
              }
            }}>
            <span>{option.label}</span>{option.value === value && <Check size={14} />}
          </button>
        ))}
      </div>}
    </div>
  );
}
