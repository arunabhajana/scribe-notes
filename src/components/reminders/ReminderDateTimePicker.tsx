import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3 } from "lucide-react";

const pad = (value: number) => String(value).padStart(2, "0");
const dateString = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const parseDate = (value: string) => new Date(`${value}T12:00:00`);
const monthStart = (value: string) => { const date = parseDate(value); date.setDate(1); return dateString(date); };
function moveDate(value: string, days: number) { const date = parseDate(value); date.setDate(date.getDate() + days); return dateString(date); }
function moveMonth(value: string, offset: number) {
  const date = parseDate(value); const day = date.getDate();
  date.setDate(1); date.setMonth(date.getMonth() + offset);
  date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  return dateString(date);
}

export function ReminderDateTimePicker({ date, time, minDate, disabled, onDateChange, onTimeChange, timeOnly = false }: {
  date: string; time: string; minDate: string; disabled: boolean;
  onDateChange: (date: string) => void; onTimeChange: (time: string) => void;
  timeOnly?: boolean;
}) {
  const [panel, setPanel] = useState<"date" | "time" | null>(null);
  const [month, setMonth] = useState(() => monthStart(date));
  const [activeDate, setActiveDate] = useState(date);
  const [hour, setHour] = useState(time.slice(0, 2));
  const [minute, setMinute] = useState(time.slice(3, 5));
  const root = useRef<HTMLDivElement>(null);
  const dateTrigger = useRef<HTMLButtonElement>(null);
  const timeTrigger = useRef<HTMLButtonElement>(null);
  const hourInput = useRef<HTMLInputElement>(null);
  const dayButtons = useRef(new Map<string, HTMLButtonElement>());
  const id = useId();
  const visibleMonth = parseDate(month);
  const start = moveDate(month, -((visibleMonth.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => moveDate(start, index));
  const validTime = /^\d{1,2}$/.test(hour) && /^\d{1,2}$/.test(minute) && Number(hour) < 24 && Number(minute) < 60;

  function close() {
    setPanel(null);
    (panel === "date" ? dateTrigger : timeTrigger).current?.focus();
  }
  function toggle(which: "date" | "time") {
    if (panel === which) { close(); return; }
    if (which === "date") {
      const selected = date < minDate ? minDate : date;
      setMonth(monthStart(selected)); setActiveDate(selected);
    } else { setHour(time.slice(0, 2)); setMinute(time.slice(3, 5)); }
    setPanel(which);
  }
  useLayoutEffect(() => {
    if (panel === "date") dayButtons.current.get(activeDate)?.focus();
    if (panel === "time") hourInput.current?.focus();
  }, [panel, activeDate]);
  useEffect(() => {
    if (!panel) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setPanel(null); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [panel]);
  function selectDate(value: string) {
    onDateChange(value); setPanel(null); dateTrigger.current?.focus();
  }
  function changeMonth(offset: number) {
    const next = moveMonth(month, offset);
    setMonth(next);
    // Focus the first selectable day in the new month.
    setActiveDate(next < minDate ? minDate : next);
  }
  function applyTime() {
    if (!validTime) return;
    onTimeChange(`${pad(Number(hour))}:${pad(Number(minute))}`);
    setPanel(null); timeTrigger.current?.focus();
  }
  function stepTime(which: "hour" | "minute", offset: number) {
    const max = which === "hour" ? 24 : 60;
    const current = Number(which === "hour" ? hour : minute) || 0;
    const next = pad((current + offset + max) % max);
    (which === "hour" ? setHour : setMinute)(next);
  }

  return <div ref={root} className={`reminder-date-time-picker${timeOnly ? " reminder-time-only" : ""}`} onKeyDown={(event) => {
    if (panel && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
  }} onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setPanel(null);
  }}>
    <div className="reminder-date-time">
      {!timeOnly && <div className="reminder-picker-field"><span id={`${id}-date-label`}>Date</span>
        <button ref={dateTrigger} className={`reminder-picker-trigger${panel === "date" ? " is-open" : ""}`} type="button" disabled={disabled}
          aria-labelledby={`${id}-date-label ${id}-date-value`} aria-expanded={panel === "date"} aria-controls={panel === "date" ? `${id}-calendar` : undefined}
          onClick={() => toggle("date")}>
          <CalendarDays size={16} /><span id={`${id}-date-value`}>{parseDate(date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span><ChevronDown size={13} />
        </button>
      </div>}
      <div className="reminder-picker-field"><span id={`${id}-time-label`}>Time</span>
        <button ref={timeTrigger} className={`reminder-picker-trigger${panel === "time" ? " is-open" : ""}`} type="button" disabled={disabled}
          aria-labelledby={`${id}-time-label ${id}-time-value`} aria-expanded={panel === "time"} aria-controls={panel === "time" ? `${id}-clock` : undefined}
          onClick={() => toggle("time")}>
          <Clock3 size={16} /><span id={`${id}-time-value`}>{time}</span><ChevronDown size={13} />
        </button>
      </div>
    </div>
    {panel === "date" && <div id={`${id}-calendar`} className="reminder-picker-panel reminder-calendar" role="group" aria-label="Choose reminder date">
      <div className="reminder-calendar-heading">
        <button type="button" className="icon-button" aria-label="Previous month" disabled={month <= monthStart(minDate)} onClick={() => changeMonth(-1)}><ChevronLeft size={17} /></button>
        <strong aria-live="polite">{visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
        <button type="button" className="icon-button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={17} /></button>
      </div>
      <div className="reminder-calendar-weekdays" aria-hidden="true">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="reminder-calendar-days" role="group" aria-label="Days">
        {days.map((value) => <button key={value} ref={(button) => { if (button) dayButtons.current.set(value, button); else dayButtons.current.delete(value); }}
          type="button" disabled={value < minDate} tabIndex={value === activeDate ? 0 : -1} aria-pressed={value === date} aria-current={value === minDate ? "date" : undefined}
          aria-label={parseDate(value).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          className={`${value.slice(0, 7) !== month.slice(0, 7) ? "is-other-month " : ""}${value === date ? "is-selected" : ""}`}
          onClick={() => selectDate(value)} onKeyDown={(event) => {
            let next: string | null = null;
            if (event.key === "ArrowLeft") next = moveDate(value, -1);
            if (event.key === "ArrowRight") next = moveDate(value, 1);
            if (event.key === "ArrowUp") next = moveDate(value, -7);
            if (event.key === "ArrowDown") next = moveDate(value, 7);
            if (event.key === "Home") next = moveDate(value, -((parseDate(value).getDay() + 6) % 7));
            if (event.key === "End") next = moveDate(value, 6 - ((parseDate(value).getDay() + 6) % 7));
            if (event.key === "PageUp" || event.key === "PageDown") next = moveMonth(value, event.key === "PageUp" ? -1 : 1);
            if (next) {
              event.preventDefault(); if (next < minDate) next = minDate;
              setActiveDate(next); if (next.slice(0, 7) !== month.slice(0, 7)) setMonth(monthStart(next));
            }
          }}>{parseDate(value).getDate()}</button>)}
      </div>
      <div className="reminder-picker-footer"><span>Arrow keys to navigate</span><button type="button" className="cancel-button" onClick={() => selectDate(minDate)}>Today</button></div>
    </div>}
    {panel === "time" && <div id={`${id}-clock`} className="reminder-picker-panel" role="group" aria-label="Choose reminder time">
      <div className="reminder-clock-heading"><strong>Choose time</strong><span>24-hour clock</span></div>
      <div className="reminder-clock-controls">
        {(["hour", "minute"] as const).map((which) => <div className="reminder-clock-column" key={which}>
          <label htmlFor={`${id}-${which}`}>{which === "hour" ? "Hour" : "Minute"}</label>
          <button type="button" aria-label={`Increase ${which}`} onClick={() => stepTime(which, 1)}><ChevronUp size={17} /></button>
          <input ref={which === "hour" ? hourInput : undefined} id={`${id}-${which}`} type="text" inputMode="numeric" maxLength={2}
            value={which === "hour" ? hour : minute} onChange={(event) => (which === "hour" ? setHour : setMinute)(event.target.value.replace(/\D/g, ""))}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); applyTime(); }
              if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); stepTime(which, event.key === "ArrowUp" ? 1 : -1); }
            }} />
          <button type="button" aria-label={`Decrease ${which}`} onClick={() => stepTime(which, -1)}><ChevronDown size={17} /></button>
        </div>)}
      </div>
      <div className="reminder-clock-minutes" role="group" aria-label="Quick minutes">
        {[0, 15, 30, 45].map((value) => <button type="button" key={value} aria-pressed={Number(minute) === value && minute !== ""} onClick={() => setMinute(pad(value))}>:{pad(value)}</button>)}
      </div>
      {!validTime && <p className="reminder-shortcut-error" role="status">Use an hour from 00–23 and minutes from 00–59.</p>}
      <div className="reminder-picker-footer"><button type="button" className="cancel-button" onClick={close}>Cancel</button><button type="button" className="new-note-button" disabled={!validTime} onClick={applyTime}>Apply time</button></div>
    </div>}
  </div>;
}
