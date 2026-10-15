import { useRef, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyMarkdownAction, continueMarkdownList } from '../src/components/editor/markdownFormatting'

function Editor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  const input = useRef<HTMLTextAreaElement>(null)
  return <>
    <textarea aria-label="Note" ref={input} value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => continueMarkdownList(event, setValue)} />
    <button onClick={() => applyMarkdownAction(input.current, value, 'bold', setValue)}>Bold</button>
  </>
}
beforeEach(() => vi.useFakeTimers())
describe('editing Markdown', () => {
  it.each([
    ['- First', '- First\n- '],
    ['3. Third', '3. Third\n4. '],
    ['9) Ninth', '9) Ninth\n10) '],
    ['  - [x] Done', '  - [x] Done\n  - [ ] '],
    ['- ', ''],
  ])('continues or exits a list: %j', (initial, expected) => {
    render(<Editor initial={initial} />)
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    input.focus(); input.setSelectionRange(initial.length, initial.length)
    fireEvent.keyDown(input, { key: 'Enter' })
    act(() => vi.runAllTimers())
    expect(input.value).toBe(expected)
    expect(input.selectionStart).toBe(expected.length)
  })
  it('leaves modified Enter to the browser', () => {
    render(<Editor initial="- First" />)
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    input.setSelectionRange(input.value.length, input.value.length)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(input.value).toBe('- First')
  })
  it('toggles bold around the selected text and preserves the selection', () => {
    render(<Editor initial="Hello world" />)
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    input.setSelectionRange(6, 11)
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    act(() => vi.runAllTimers())
    expect(input.value).toBe('Hello **world**')
    expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe('world')
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    act(() => vi.runAllTimers())
    expect(input.value).toBe('Hello world')
  })
})
