import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { notePreview } from '../src/features/notes/notePreview';
import { MarkdownPreview } from '../src/components/editor/MarkdownPreview';

describe('bounded note-card previews', () => {
  it('bounds parsing and DOM size without modifying the original note', () => {
    const body = '# Start\n\n' + 'A long note. '.repeat(20000) + '\nTHE END';
    const preview = notePreview(body);
    expect(preview.length).toBeLessThanOrEqual(2048);
    expect(body).toContain('THE END');
    const { container } = render(<MarkdownPreview value={preview} />);
    expect(container.textContent).toContain('Start');
    expect(container.textContent).not.toContain('THE END');
    expect(container.innerHTML.length).toBeLessThan(8000);
  });
  it('preserves numbered lists and fenced code while limiting long line collections', () => {
    const body = '1. First\n\n```powershell\ngit status\n```\n\n2. Second\n' + 'Another line\n'.repeat(1000);
    const { container } = render(<MarkdownPreview value={notePreview(body)} />);
    expect(container.querySelector('pre code')).toHaveTextContent('git status');
    expect(container.querySelector('ol li[value="2"]')).toHaveTextContent('Second');
    expect(notePreview(body).split('\n').length).toBeLessThanOrEqual(24);
  });
  it('keeps the first command in a legacy code block when its closing fence is beyond the preview', () => {
    const body = '```git status\n' + 'another command\n'.repeat(500) + '```';
    const { container } = render(<MarkdownPreview value={notePreview(body)} />);
    expect(container.querySelector('pre code')).toHaveTextContent('git status');
    expect(notePreview(body).length).toBeLessThanOrEqual(2048);
  });
});
