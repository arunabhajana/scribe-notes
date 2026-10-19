import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { matchesNoteSearch, searchSnippet, searchTerms } from '../src/features/notes/noteSearch';
import { FIND_LIMIT, findText, highlightMarkdown } from '../src/features/notes/findText';
import { compareText } from '../src/features/notes/textComparison';
import { MarkdownPreview } from '../src/components/editor/MarkdownPreview';
import type { Note } from '../src/types/note';

const note: Note = { id: 'test', title: 'Release notes', body: 'Keep a clear plan for better search.',
  folderId: null, pinned: false, isDraft: false, deletedAt: null, createdAt: '', updatedAt: '' };

describe('note search', () => {
  it('matches words in any order across title and content', () => {
    expect(matchesNoteSearch(note, 'search release')).toBe(true);
    expect(matchesNoteSearch(note, 'search missing')).toBe(false);
  });
  it('keeps quoted phrases together and combines them with other words', () => {
    expect(searchTerms('release "better search"')).toEqual(['release', 'better search']);
    expect(matchesNoteSearch(note, 'release "better search"')).toBe(true);
    expect(matchesNoteSearch(note, '"search better"')).toBe(false);
  });
  it('limits the query to the chosen field', () => {
    expect(matchesNoteSearch(note, 'release', 'title')).toBe(true);
    expect(matchesNoteSearch(note, 'search', 'title')).toBe(false);
    expect(matchesNoteSearch(note, 'search', 'body')).toBe(true);
    expect(matchesNoteSearch(note, 'release', 'body')).toBe(false);
  });
  it('invalidates cached text with a replacement note object', () => {
    expect(matchesNoteSearch(note, 'search')).toBe(true);
    expect(matchesNoteSearch({ ...note, body: 'A different thought' }, 'search')).toBe(false);
  });
  it('shows a bounded excerpt near the match', () => {
    const snippet = searchSnippet('start '.repeat(100) + 'needle ' + 'end '.repeat(100), 'needle');
    expect(snippet).toContain('needle');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(232);
  });
});

describe('find in note', () => {
  it('treats regular expression characters as literal text', () => {
    expect(findText('a.b [x] a*b a.b', 'a.b')).toEqual([{ start: 0, end: 3 }, { start: 12, end: 15 }]);
    expect(findText('[x] other', '[x]')).toEqual([{ start: 0, end: 3 }]);
  });
  it('supports case matching and original Unicode selection offsets', () => {
    expect(findText('😀 Note note', 'note')).toEqual([{ start: 3, end: 7 }, { start: 8, end: 12 }]);
    expect(findText('Note note', 'note', true)).toEqual([{ start: 5, end: 9 }]);
    expect(findText('Note', '')).toEqual([]);
  });
  it('bounds matches for a very repetitive note', () => {
    expect(findText('a'.repeat(FIND_LIMIT + 100), 'a')).toHaveLength(FIND_LIMIT);
  });
  it('highlights a phrase across inline formatting as one match', () => {
    const { container } = render(<MarkdownPreview value={'A **better** search.'} findQuery="better search" />);
    const marks = [...container.querySelectorAll('mark[data-note-match]')];
    expect(marks.map(mark => mark.textContent).join('')).toBe('better search');
    expect(new Set(marks.map(mark => mark.getAttribute('data-note-match'))).size).toBe(1);
    expect(container.querySelector('strong mark')).not.toBeNull();
  });
  it('never highlights attributes or changes external-link safety', () => {
    const { container } = render(<MarkdownPreview value={'[Website](https://example.com/path)'} findQuery="https" />);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/path');
    expect(container.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('keeps hostile Markdown inert even while highlighting', () => {
    const { container } = render(<MarkdownPreview value={'<script>alert(1)</script> [bad](javascript:alert(1))'} findQuery="script" />);
    expect(container.querySelector('script, iframe, img, svg')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelectorAll('mark').length).toBeGreaterThan(0);
  });
  it('does not inject a hostile query as markup', () => {
    const html = highlightMarkdown('<p>Plain text</p>', '<img src=x onerror=alert(1)>', false);
    expect(html).toBe('<p>Plain text</p>');
  });
});

describe('bounded history comparison', () => {
  it.each([
    ['', ''], ['', 'new text'], ['earlier text', ''], ['same text', 'same text'],
    ['A quiet note\nwith code', 'A clearer note\nwith code'],
    ['one two one three', 'one three two one'],
    ['😀 café\n', '😀 café and tea\n'],
    ['same\n'.repeat(200) + 'old\n', 'same\n'.repeat(200) + 'new\n'],
    ['old '.repeat(5000), 'new '.repeat(5000)],
  ])('preserves both versions of %j', (earlier, current) => {
    const changes = compareText(earlier, current);
    expect(changes.filter(change => change.kind !== 'added').map(change => change.text).join('')).toBe(earlier);
    expect(changes.filter(change => change.kind !== 'removed').map(change => change.text).join('')).toBe(current);
  });
  it('marks changed words and preserves common context', () => {
    expect(compareText('a quiet place', 'a calmer place')).toEqual([
      { kind: 'same', text: 'a ' }, { kind: 'removed', text: 'quiet' },
      { kind: 'added', text: 'calmer' }, { kind: 'same', text: ' place' },
    ]);
  });
});
