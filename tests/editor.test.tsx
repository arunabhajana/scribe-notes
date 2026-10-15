import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownPreview } from '../src/components/editor/MarkdownPreview'
import { setMarkdownTaskCheckedAtLine } from '../src/features/notes/markdownTasks'
import { sortNotes } from '../src/features/notes/noteSorting'
import { note } from './fixtures'

describe('reading mode', () => {
  it('renders formatting while keeping raw HTML inert', () => {
    const { container } = render(<MarkdownPreview value={'# Heading\n\n**Bold**\n\n<img src=x onerror=alert(1)>'} />)
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument()
    expect(container.querySelector('strong')).toHaveTextContent('Bold')
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>')
  })
  it('does not make dangerous URLs clickable', () => {
    const { container } = render(<MarkdownPreview value={'[bad](javascript:alert(1))\n\n[good](https://example.com)'} />)
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://example.com/')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
  it('reports the source line when clicking a task', () => {
    const toggle = vi.fn()
    render(<MarkdownPreview value={'# Tasks\n\n- [ ] Buy milk'} onToggleTask={toggle} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(toggle).toHaveBeenCalledWith(2, true)
  })
})

describe('note tasks and sorting', () => {
  it('updates only the chosen task and preserves Windows line endings', () => {
    expect(setMarkdownTaskCheckedAtLine('- [ ] First\r\n- [ ] Second', 1, true)).toBe('- [ ] First\r\n- [x] Second')
    expect(setMarkdownTaskCheckedAtLine('Paragraph', -1, true)).toBe('Paragraph')
  })
  it('sorts numeric titles naturally without mutating the input', () => {
    const notes = [note({ title: 'Note 10' }), note({ title: 'Note 2' })]
    expect(sortNotes(notes, 'name-asc').map(item => item.title)).toEqual(['Note 2', 'Note 10'])
    expect(notes[0].title).toBe('Note 10')
  })
  it('keeps invalid dates last for both date sort directions', () => {
    const notes = [note({ title: 'Invalid', createdAt: 'invalid' }), note({ title: 'Valid' })]
    for (const order of ['created-asc', 'created-desc'] as const) expect(sortNotes(notes, order)[0].title).toBe('Valid')
  })
})
