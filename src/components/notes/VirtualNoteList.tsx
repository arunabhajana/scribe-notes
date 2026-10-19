import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import type { Note } from '../../types/note';

function lowerBound(values: number[], value: number) {
  let left = 0, right = values.length;
  while (left < right) { const middle = (left + right) >>> 1; if (values[middle] < value) left = middle + 1; else right = middle; }
  return left;
}

function MeasuredRow({ id, index, top, onHeight, children }: { id: string; index: number; top: number; onHeight: (id: string, height: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => onHeight(id, element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [id, onHeight]);
  return <div ref={ref} data-note-index={index} style={{ position: 'absolute', top, left: 0, right: 0 }}>{children}</div>;
}

export function VirtualNoteList({ notes, selectedId, selectedIds = [], onDragSelection, children }: { notes: Note[]; selectedId: string | null; selectedIds?: string[]; onDragSelection?: (ids: string[]) => void; children: (note: Note, index: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [viewport, setViewport] = useState({ top: 0, height: 700 });
  const focusIndex = useRef<number | null>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; contentY: number; currentX: number; currentY: number; active: boolean; base: string[] } | null>(null);
  const frame = useRef<number | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const virtual = notes.length >= 150;
  const onHeight = useCallback((id: string, height: number) => setHeights(current => Math.abs((current[id] ?? 0) - height) < 1 ? current : { ...current, [id]: height }), []);
  const positions = useMemo(() => {
    let height = 0;
    const offsets: number[] = [];
    for (const note of notes) { offsets.push(height); height += (heights[note.id] ?? 145) + 8; }
    return { offsets, height };
  }, [notes, heights]);
  const latest = useRef({ notes, positions, virtual, heights, onDragSelection });
  useLayoutEffect(() => { latest.current = { notes, positions, virtual, heights, onDragSelection }; }, [notes, positions, virtual, heights, onDragSelection]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  function updateDrag() {
    const state = drag.current, element = ref.current;
    if (!state?.active || !element) return;
    const rect = element.getBoundingClientRect();
    const end = state.currentY - rect.top + element.scrollTop - 12;
    const low = Math.min(state.contentY, end), high = Math.max(state.contentY, end);
    const data = latest.current;
    let ids: string[];
    if (data.virtual) {
      const start = Math.max(0, lowerBound(data.positions.offsets, low) - 1);
      const stop = lowerBound(data.positions.offsets, high);
      ids = data.notes.slice(start, stop).filter((note, index) => data.positions.offsets[start + index] + (data.heights[note.id] ?? 145) >= low).map(note => note.id);
    } else {
      ids = [...element.querySelectorAll<HTMLElement>('[data-note-index]')].filter(row => {
        const bounds = row.getBoundingClientRect();
        const top = bounds.top - rect.top + element.scrollTop - 12;
        return top <= high && top + bounds.height >= low;
      }).map(row => data.notes[Number(row.dataset.noteIndex)]?.id).filter((id): id is string => Boolean(id));
    }
    data.onDragSelection?.([...new Set([...state.base, ...ids])]);
    const startY = state.contentY - element.scrollTop + rect.top + 12;
    const top = Math.max(rect.top, Math.min(startY, state.currentY));
    const bottom = Math.min(rect.bottom, Math.max(startY, state.currentY));
    const left = Math.max(rect.left, Math.min(state.x, state.currentX));
    const right = Math.min(rect.right, Math.max(state.x, state.currentX));
    setBox({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) });
  }
  function scrollDrag() {
    const state = drag.current, element = ref.current;
    if (!state?.active || !element) return;
    const rect = element.getBoundingClientRect();
    const speed = state.currentY < rect.top + 30 ? -12 : state.currentY > rect.bottom - 30 ? 12 : 0;
    if (speed) { element.scrollTop += speed; updateDrag(); }
    frame.current = requestAnimationFrame(scrollDrag);
  }
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointer) return;
    if (state.active) {
      event.preventDefault();
      const element = event.currentTarget;
      element.dataset.suppressClick = 'true';
      window.setTimeout(() => { delete element.dataset.suppressClick; }, 0);
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    }
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    drag.current = null; setBox(null);
  }
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setViewport({ top: element.scrollTop, height: element.clientHeight });
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const index = notes.findIndex(note => note.id === selectedId);
    const element = ref.current;
    if (!virtual || !element || index < 0) return;
    const top = positions.offsets[index], bottom = top + (heights[notes[index].id] ?? 145);
    if (top < element.scrollTop || bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = Math.max(0, top - 12);
      setViewport({ top: element.scrollTop, height: element.clientHeight });
    }
    // Scroll only when selection changes, allowing free browsing afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, virtual]);
  useLayoutEffect(() => {
    if (focusIndex.current === null) return;
    const card = ref.current?.querySelector<HTMLElement>(`[data-note-index="${focusIndex.current}"] [role="button"]`);
    if (card) { card.focus({ preventScroll: true }); focusIndex.current = null; }
  });
  const firstVisible = virtual ? Math.max(0, lowerBound(positions.offsets, viewport.top) - 1 - 6) : 0;
  const lastVisible = virtual ? Math.min(notes.length, Math.max(firstVisible + 20, lowerBound(positions.offsets, viewport.top + viewport.height) + 7)) : notes.length;
  return <div className="notes-scroll" ref={ref} data-sync-editing={box ? 'true' : undefined}
    onPointerDown={event => {
      if (!onDragSelection || event.button !== 0 || event.pointerType !== 'mouse' || (event.target as HTMLElement).closest('button, input, a, select, textarea')) return;
      const rect = event.currentTarget.getBoundingClientRect();
      drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, contentY: event.clientY - rect.top + event.currentTarget.scrollTop - 12, currentX: event.clientX, currentY: event.clientY, active: false, base: event.ctrlKey || event.metaKey ? selectedIds : [] };
    }} onPointerMove={event => {
      const state = drag.current;
      if (!state || event.pointerId !== state.pointer) return;
      state.currentX = event.clientX; state.currentY = event.clientY;
      if (!state.active && Math.hypot(event.clientX - state.x, event.clientY - state.y) > 6) {
        state.active = true; event.currentTarget.setPointerCapture(event.pointerId); frame.current = requestAnimationFrame(scrollDrag);
      }
      if (state.active) { event.preventDefault(); updateDrag(); }
    }} onPointerUp={endDrag} onPointerCancel={endDrag}
    onScroll={event => setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })} onKeyDown={event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.ctrlKey || event.metaKey || !(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'button') return;
    const index = Number(event.target.closest<HTMLElement>('[data-note-index]')?.dataset.noteIndex);
    if (!Number.isInteger(index)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? notes.length - 1 : Math.max(0, Math.min(notes.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    if (!virtual) {
      const card = ref.current?.querySelector<HTMLElement>(`[data-note-index="${next}"] [role="button"]`);
      card?.focus({ preventScroll: true }); card?.scrollIntoView({ block: 'nearest' });
      return;
    }
    focusIndex.current = next;
    if (ref.current) { ref.current.scrollTop = positions.offsets[next]; setViewport({ top: ref.current.scrollTop, height: ref.current.clientHeight }); }
  }}>
    {virtual ? <div style={{ position: 'relative', height: positions.height, flexShrink: 0 }}>{notes.slice(firstVisible, lastVisible).map((note, offset) => <MeasuredRow key={note.id} id={note.id} index={firstVisible + offset} top={positions.offsets[firstVisible + offset]} onHeight={onHeight}>{children(note, firstVisible + offset)}</MeasuredRow>)}</div> : notes.map((note, index) => <div key={note.id} data-note-index={index}>{children(note, index)}</div>)}
    {box && <div className="note-selection-box" aria-hidden="true" style={{ position: 'fixed', ...box }}/>}
  </div>;
}
