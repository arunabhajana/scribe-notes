import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export function VersionDropdown({ value, options, onChange }: {
  value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const selected = options.find(option => option.value === value);
  function close() { setOpen(false); trigger.current?.focus(); }
  function show(last = false) {
    const bounds = trigger.current?.getBoundingClientRect();
    const dialog = root.current?.closest('dialog')?.getBoundingClientRect();
    setAbove(Boolean(bounds && Math.min(window.innerHeight, dialog?.bottom ?? window.innerHeight) - bounds.bottom < 210 && bounds.top - (dialog?.top ?? 0) > 210));
    setActive(last ? options.length - 1 : Math.max(0, options.findIndex(option => option.value === value)));
    setOpen(true);
  }
  useLayoutEffect(() => { if (open) items.current[active]?.focus(); }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div ref={root} className="update-version-dropdown" onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button ref={trigger} type="button" className="update-version-trigger" aria-label={`Version: ${selected?.label ?? value}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => open ? close() : show()} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(event.key === 'ArrowUp'); }
      }}><span>{selected?.label ?? value}</span><ChevronDown size={14} /></button>
    {open && <div id={menuId} className={`update-version-menu${above ? ' opens-above' : ''}`} role="listbox" aria-label="Version">{options.map((option, index) =>
      <button key={option.value} ref={element => { items.current[index] = element; }} type="button" role="option" aria-selected={option.value === value} tabIndex={active === index ? 0 : -1}
        onClick={() => { onChange(option.value); close(); }} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
          else if (event.key === 'Tab') close();
          else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault(); setActive(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
          }
        }}><span>{option.label}</span><span className="update-version-check">{option.value === value && <Check size={14} />}</span></button>
    )}</div>}
  </div>;
}
