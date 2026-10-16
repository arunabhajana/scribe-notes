import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { parseChangelog, changelogMarkdown } from '../scripts/lib/changelog.mts';
import { ChangeSections } from '../src/components/updates/WhatsNewDialog';

const valid = { schemaVersion: 1, version: '1.2.3', title: 'Better writing', summary: 'A brief update.', sections: [{ type: 'feature', items: ['New feature'] }, { type: 'fixed', items: ['A fix'] }] };
describe('release changelog contract', () => {
  it('uses the same validated summary and sections for release notes', () => {
    const log = parseChangelog(valid, '1.2.3');
    expect(changelogMarkdown(log)).toContain('A brief update.');
    expect(changelogMarkdown(log)).toContain('## Fixed\n\n- A fix');
  });
  it.each([
    null, { ...valid, schemaVersion: 2 }, { ...valid, version: '01.2.3' },
    { ...valid, version: '1.2.3\n' }, { ...valid, version: '1.2.3-01' },
    { ...valid, summary: 'x'.repeat(241) }, { ...valid, title: '' },
    { ...valid, sections: [] }, { ...valid, sections: [{ type: 'html', items: ['test'] }] },
    { ...valid, sections: [valid.sections[0], valid.sections[0]] },
    { ...valid, sections: [{ type: 'fixed', items: [''] }] },
  ])('rejects malformed changelog %j', input => { expect(() => parseChangelog(input)).toThrow(); });
  it('rejects a version mismatch before release', () => { expect(() => parseChangelog(valid, '1.2.4')).toThrow(); });
  it('renders coloured category labels and treats content as plain text', () => {
    const log = parseChangelog({ ...valid, sections: [{ type: 'fixed', items: ['<img src=x onerror=alert(1)>'] }] });
    const { container } = render(<ChangeSections log={log} />);
    expect(screen.getByText('Fixed')).toHaveClass('change-fixed');
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
  });
});
