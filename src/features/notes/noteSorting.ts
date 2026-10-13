import type { Note } from "../../types/note";

export const noteSortOptions = [
  { value: "modified-desc", label: "Last modified · newest first" },
  { value: "modified-asc", label: "Last modified · oldest first" },
  { value: "name-asc", label: "Name · A–Z" },
  { value: "name-desc", label: "Name · Z–A" },
  { value: "created-desc", label: "Date created · newest first" },
  { value: "created-asc", label: "Date created · oldest first" },
] as const;

export type NoteSort = typeof noteSortOptions[number]["value"];
export const defaultNoteSort: NoteSort = "modified-desc";
export function isNoteSort(value: unknown): value is NoteSort {
  return noteSortOptions.some((option) => option.value === value);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sortNotes(notes: Note[], order: NoteSort) {
  return [...notes].sort((a, b) => {
    const firstTitle = a.title.trim() || "Untitled note";
    const secondTitle = b.title.trim() || "Untitled note";
    let comparison = 0;
    if (order.startsWith("name")) {
      comparison = collator.compare(firstTitle, secondTitle);
      if (order === "name-desc") comparison *= -1;
    } else {
      const created = order.startsWith("created");
      const first = timestamp(created ? a.createdAt : a.updatedAt) ?? (created ? null : timestamp(a.createdAt));
      const second = timestamp(created ? b.createdAt : b.updatedAt) ?? (created ? null : timestamp(b.createdAt));
      if (first === null && second !== null) return 1;
      if (second === null && first !== null) return -1;
      if (first !== null && second !== null) comparison = order.endsWith("asc") ? first - second : second - first;
    }
    return comparison || collator.compare(firstTitle, secondTitle) || a.id.localeCompare(b.id);
  });
}
