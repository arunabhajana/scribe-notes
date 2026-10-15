import { describe, expect, it } from 'vitest'
import { makeBackup, makeMarkdown, parseScribeBackup, selectedData } from '../src/features/transfer/portableData'
import { createMarkdownZip, readMarkdownZip } from '../src/features/transfer/markdownZip'
import { folder, note, portable } from './fixtures'

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
describe('portable backups', () => {
  it('round trips notes, formatting, Unicode, folders, reminders, drafts and Trash', () => {
    const data = portable()
    data.notes[0] = note({ folderId: folder().id, isDraft: true, pinned: true, deletedAt: '2026-01-02T00:00:00.000Z' })
    expect(parseScribeBackup(decode(makeBackup(data)))).toEqual(data)
  })
  it('excludes server revisions and nonportable fields', () => {
    const data = portable()
    Object.assign(data.notes[0], { version: 3, userId: 'private-owner', access_token: 'not-for-export' })
    const output = decode(makeBackup(data))
    expect(output).not.toContain('private-owner')
    expect(output).not.toContain('access_token')
    expect(JSON.parse(output).data.notes[0]).not.toHaveProperty('version')
  })
  it.each(['not JSON', '{}', '{"format":"scribe-backup","version":99}'])('rejects corrupt or unsupported files: %s', raw => {
    expect(() => parseScribeBackup(raw)).toThrow()
  })
  it('rejects duplicate IDs and missing folder references', () => {
    const data = portable()
    data.notes.push({ ...data.notes[0] })
    expect(() => makeBackup(data)).toThrow(/duplicate/i)
    data.notes.pop(); data.folders = []
    expect(() => makeBackup(data)).toThrow(/missing folder/i)
  })
  it('exports only selected notes and their reminders/folders', () => {
    const data = portable()
    data.notes.push(note({ id: '33333333-3333-4333-8333-333333333333' }))
    expect(selectedData(data, new Set([data.notes[0].id]), true, false)).toEqual(portable())
    expect(selectedData(data, new Set(), false, false)).toEqual({ notes: [], folders: [], reminders: [] })
    expect(selectedData(data, new Set(), false, true).folders).toEqual(data.folders)
  })
})

describe('Markdown ZIP portability', () => {
  it('round trips Unicode Markdown and safe folder names', async () => {
    const result = await readMarkdownZip(makeMarkdown(portable()))
    expect(result.files).toEqual([{ name: 'Projects/001 A note.md', text: '# A note\n\nHello **Scribe** 👋' }])
    expect(result.ignored).toBe(0)
  })
  it('sanitizes Windows reserved names and path separators on export', async () => {
    const data = portable(); data.folders[0].name = 'CON'; data.notes[0].title = '../bad/name'
    const { files } = await readMarkdownZip(makeMarkdown(data))
    expect(files[0].name).toBe('_CON/001 .._bad_name.md')
  })
  it('rejects truncated archives', async () => {
    await expect(readMarkdownZip(new Uint8Array([0x50, 0x4b]))).rejects.toThrow()
  })
  it('rejects modified file bytes through the CRC integrity check', async () => {
    const bytes = createMarkdownZip([{ name: 'note.md', text: 'secret content' }])
    bytes[30 + new TextEncoder().encode('note.md').length] ^= 1
    await expect(readMarkdownZip(bytes)).rejects.toThrow(/integrity/i)
  })
})
