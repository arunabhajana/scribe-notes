import { SlidersHorizontal } from 'lucide-react';
import { useContextMenu } from '../context-menu/contextMenuState';
import { defaultSearchFilters, type NoteSearchFilters, type SearchField } from '../../features/notes/noteSearch';

export function SearchFilters({ value, onChange }: { value: NoteSearchFilters; onChange: (value: NoteSearchFilters) => void }) {
  const open = useContextMenu();
  const count = Number(value.field !== 'all') + Number(value.pinned) + Number(value.reminder);
  return <div className="note-search-filters">
    <button type="button" className={count ? 'is-active' : ''} aria-haspopup="menu" aria-label={`Filter notes${count ? `, ${count} active` : ''}`} onClick={event => {
      const target = event.currentTarget;
      const rect = target.getBoundingClientRect();
      open(rect.left, rect.bottom + 4, [
        ...([['all', 'Search titles and content'], ['title', 'Search titles only'], ['body', 'Search content only']] as [SearchField, string][]).map(([field, label]) => ({ label, checked: value.field === field, radio: true, action: () => onChange({ ...value, field }) })),
        { label: 'Pinned notes only', separator: true, checked: value.pinned, action: () => onChange({ ...value, pinned: !value.pinned }) },
        { label: 'With a reminder', checked: value.reminder, action: () => onChange({ ...value, reminder: !value.reminder }) },
        { label: 'Reset filters', separator: true, disabled: !count, action: () => onChange({ ...defaultSearchFilters }) },
      ], target);
    }}><SlidersHorizontal size={13} /><span>Filters{count ? ` · ${count}` : ''}</span></button>
    {count > 0 && <button type="button" className="clear-filters" onClick={() => onChange({ ...defaultSearchFilters })}>Clear</button>}
  </div>;
}
