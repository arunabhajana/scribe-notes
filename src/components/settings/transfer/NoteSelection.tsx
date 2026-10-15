import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Note, NoteFolder } from "../../../types/note";

export function NoteSelection({ notes, folders, selected, onChange, disabled }: {
  notes: Note[]; folders: NoteFolder[]; selected: Set<string>; onChange: (value: Set<string>) => void; disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);
  const folderNames = useMemo(() => new Map(folders.map(folder => [folder.id, folder.name])), [folders]);
  const matching = useMemo(() => notes.filter(note => `${note.title}\n${note.body}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [notes, search]);
  const count = notes.filter(note => selected.has(note.id)).length;
  const toggle = (id: string, checked: boolean) => { const next = new Set(selected); if (checked) next.add(id); else next.delete(id); onChange(next); };
  return <section className="transfer-selection" aria-label="Choose notes">
    <div className="transfer-selection-heading"><strong>{count} of {notes.length} notes selected</strong><div><button type="button" disabled={disabled || !matching.length} onClick={() => onChange(new Set([...selected, ...matching.map(note => note.id)]))}>Select {search ? "matching" : "all"}</button><button type="button" disabled={disabled || !selected.size} onClick={() => onChange(new Set())}>Clear all</button></div></div>
    <label className="transfer-search"><Search size={15} /><input type="search" aria-label="Search notes to select" placeholder="Find a note…" value={search} disabled={disabled} onChange={event => { setSearch(event.target.value); setLimit(100); }} /></label>
    <div className="transfer-note-list">
      {matching.slice(0, limit).map(note => <label className={`transfer-note ${selected.has(note.id) ? "is-selected" : ""}`} key={note.id}>
        <input type="checkbox" checked={selected.has(note.id)} disabled={disabled} onChange={event => toggle(note.id, event.target.checked)} />
        <span className="transfer-note-copy"><strong title={note.title}>{note.title || "Untitled note"}</strong><small>{note.folderId ? folderNames.get(note.folderId) ?? "Unfiled" : "Unfiled"}<span aria-hidden="true"> · </span>{note.body.replace(/[\r\n]+/g, " ").slice(0, 85) || "Empty note"}</small></span>
        {(note.deletedAt || note.isDraft) && <span className="transfer-note-tag">{note.deletedAt ? "Trash" : "Draft"}</span>}
      </label>)}
      {!matching.length && <p className="transfer-empty">{notes.length ? "No matching notes." : "No notes in this selection."}</p>}
      {matching.length > limit && <button className="transfer-show-more" type="button" onClick={() => setLimit(value => value + 100)}>Showing {limit} of {matching.length} · Show more</button>}
    </div>
    {search && <small className="transfer-selection-help">Search narrows this list. Selected notes outside the search are included too.</small>}
  </section>;
}
