import { beforeEach, describe, expect, it, vi } from 'vitest'
import { note, timestamp, workspaceA as a, workspaceB as b } from './fixtures'
import { captureHistory, type HistoryRecord } from '../src/features/notes/noteHistory'
import { matchesNoteSearch } from '../src/features/notes/noteSearch'

beforeEach(() => vi.resetModules())

async function storage() {
  const { offlineStore: store } = await import('../src/features/notes/offlineStore')
  const { writeWorkspacePreference } = await import('../src/features/settings/workspacePreferences')
  return { store, enable: (owner: string, enabled = true) => writeWorkspacePreference(owner, 'scribe-note-history', String(enabled)) }
}

describe('local note history', () => {
  it('is off by default and never changes the saved note or sync payload', async () => {
    const { store } = await storage()
    await store.putNote(a, note(), null, true)
    await store.putNote(a, note({ body: 'Latest text' }), timestamp)
    expect(await store.noteHistory(a, note().id)).toBeNull()
    await store.checkpointNote(a, note().id)
    expect(await store.noteHistory(a, note().id)).toBeNull()
    const { batch } = await store.prepareBatch(a)
    expect(batch.operations).toHaveLength(1)
    expect((await store.getNote(a, note().id))?.body).toBe('Latest text')
    expect(JSON.stringify(batch)).not.toContain('snapshots')
  })

  it('captures earlier text at most once a minute while saving every edit', async () => {
    let time = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => time)
    const { store, enable } = await storage()
    enable(a)
    await store.putNote(a, note(), null, true)
    await store.putNote(a, note({ title: 'Second', body: 'Second text' }), timestamp)
    await store.putNote(a, note({ title: 'Third', body: 'Third text' }), timestamp)
    expect((await store.noteHistory(a, note().id))?.snapshots).toMatchObject([{ title: note().title, body: note().body }])
    expect((await store.getNote(a, note().id))?.body).toBe('Third text')
    time += 61_000
    await store.putNote(a, note({ title: 'Fourth', body: 'Fourth text' }), timestamp)
    expect((await store.noteHistory(a, note().id))?.snapshots.map(snapshot => snapshot.body)).toEqual([note().body, 'Third text'])
  })

  it('checkpoints current text before restoration, without duplicating identical checkpoints', async () => {
    const { store, enable } = await storage()
    enable(a)
    await store.putNote(a, note(), null, true)
    await store.putNote(a, note({ body: 'Current text to protect' }), timestamp)
    await store.checkpointNote(a, note().id)
    const snapshots = (await store.noteHistory(a, note().id))!.snapshots
    expect(snapshots.at(-1)?.body).toBe('Current text to protect')
    await store.checkpointNote(a, note().id)
    expect((await store.noteHistory(a, note().id))?.snapshots).toEqual(snapshots)
    await store.checkpointNote(a, 'missing-note')
    expect(await store.noteHistory(a, 'missing-note')).toBeNull()
  })

  it('clears a single note or a workspace without clearing another workspace', async () => {
    const { store, enable } = await storage()
    const second = note({ id: '33333333-3333-4333-8333-333333333333' })
    for (const owner of [a, b]) {
      enable(owner)
      for (const item of [note(), second]) {
        await store.putNote(owner, item, null, true)
        await store.putNote(owner, { ...item, body: 'Updated text' }, timestamp)
      }
    }
    await store.clearHistory(a, note().id)
    expect(await store.noteHistory(a, note().id)).toBeNull()
    expect((await store.noteHistory(a, second.id))?.snapshots).toHaveLength(1)
    expect((await store.noteHistory(b, note().id))?.snapshots).toHaveLength(1)
    enable(a, false)
    await store.clearHistory(a)
    await store.putNote(a, { ...second, body: 'History disabled' }, timestamp)
    expect(await store.noteHistory(a, second.id)).toBeNull()
    expect((await store.noteHistory(b, second.id))?.snapshots).toHaveLength(1)
  })

  it('keeps history in Trash, removes it on permanent deletion and includes its size in inspection', async () => {
    const { store, enable } = await storage()
    enable(a)
    await store.putNote(a, note(), null, true)
    await store.putNote(a, note({ body: 'Saved edit' }), timestamp)
    const before = await store.inspectWorkspace(a)
    await store.checkpointNote(a, note().id)
    expect((await store.inspectWorkspace(a)).bytes).toBeGreaterThan(before.bytes)
    await store.putNote(a, note({ body: 'Saved edit', deletedAt: timestamp }), timestamp)
    expect((await store.noteHistory(a, note().id))?.snapshots).toHaveLength(2)
    await store.deleteEntity(a, 'note', note().id, timestamp)
    expect(await store.noteHistory(a, note().id)).toBeNull()
    expect(await store.getNote(a, note().id)).toBeNull()
  })

  it('purges history when a remote deletion is applied', async () => {
    const { store, enable } = await storage()
    enable(a)
    await store.putNote(a, note(), null, true)
    await store.putNote(a, note({ body: 'Edited' }), timestamp)
    const sent = await store.prepareBatch(a)
    await store.commitBatch(a, sent.batch, { cursor: '1', full: false, hasMore: false, changes: [], results: [
      { revisionId: sent.batch.operations[0].revisionId, status: 'applied', snapshot: note({ body: 'Edited', version: 1 }) },
    ] })
    const pull = await store.prepareBatch(a)
    await store.commitBatch(a, pull.batch, { cursor: '2', full: false, hasMore: false, changes: [{ entity: 'note', id: note().id, snapshot: null }], results: [] })
    expect(await store.noteHistory(a, note().id)).toBeNull()
    expect((await store.load(a)).notes).toEqual([])
  })
})

describe('durable conflict reviews', () => {
  async function conflict(owner: string) {
    const { store } = await storage()
    await store.putNote(owner, note({ body: 'Preserved local text' }), timestamp)
    const { batch } = await store.prepareBatch(owner)
    await store.commitBatch(owner, batch, { cursor: '1', full: false, hasMore: false, changes: [], results: [
      { revisionId: batch.operations[0].revisionId, status: 'conflict', snapshot: note({ body: 'Shared text', version: 2 }) },
    ] })
    return store
  }

  it('records the original/copy relationship and resolves a review without deleting either note', async () => {
    const store = await conflict(a)
    const [review] = await store.conflicts(a)
    expect(review.originalId).toBe(note().id)
    expect((await store.getNote(a, review.noteId))?.body).toBe('Preserved local text')
    expect(await store.conflicts(b)).toEqual([])
    await store.resolveConflict(a, review.noteId)
    expect(await store.conflicts(a)).toEqual([])
    expect((await store.load(a)).notes).toHaveLength(2)
  })

  it('removes review metadata when its copy is permanently deleted', async () => {
    const store = await conflict(a)
    const [review] = await store.conflicts(a)
    await store.deleteEntity(a, 'note', review.noteId, timestamp)
    expect(await store.conflicts(a)).toEqual([])
    expect((await store.getNote(a, note().id))?.body).toBe('Shared text')
  })

  it('clears history and conflict reviews only for the deleted workspace', async () => {
    const store = await conflict(a)
    await conflict(b)
    const { enable } = await storage()
    for (const owner of [a, b]) { enable(owner); await store.checkpointNote(owner, note().id) }
    await store.deleteWorkspace(a)
    expect(await store.conflicts(a)).toEqual([])
    expect(await store.noteHistory(a, note().id)).toBeNull()
    expect((await store.conflicts(b))).toHaveLength(1)
    expect((await store.noteHistory(b, note().id))?.snapshots).toHaveLength(1)
    await expect(store.checkpointNote(a, note().id)).rejects.toThrow()
  })
})

describe('history retention limits', () => {
  it('ignores unchanged, trashed and oversized text, counting UTF-8 bytes', () => {
    const records: HistoryRecord[] = []
    expect(captureHistory(records, a, note(), note())).toBe(records)
    expect(captureHistory(records, a, note({ deletedAt: timestamp }), note({ body: 'Changed' }))).toBe(records)
    expect(captureHistory(records, a, note(), note({ deletedAt: timestamp }))).toBe(records)
    expect(captureHistory(records, a, note({ body: '💡'.repeat(26_000) }), note({ body: 'Shorter' }))).toBe(records)
  })

  it('keeps only ten earlier versions and skips duplicate text', () => {
    const time = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(time)
    const existing: HistoryRecord[] = [{ key: `${a}:${note().id}`, userId: a, noteId: note().id,
      snapshots: Array.from({ length: 10 }, (_, index) => ({ id: String(index), title: 'Earlier', body: `Version ${index}`, savedAt: time - (11 - index) * 61_000 })) }]
    const result = captureHistory(existing, a, note({ body: 'Latest earlier text' }), note({ body: 'New text' }))
    expect(result[0].snapshots).toHaveLength(10)
    expect(result[0].snapshots[0].body).toBe('Version 1')
    expect(result[0].snapshots.at(-1)).toMatchObject({ title: note().title, body: 'Latest earlier text' })
    expect(captureHistory(result, a, note({ body: 'Latest earlier text' }), note({ body: 'Another edit' }), true)).toBe(result)
    expect(captureHistory(result, a, note({ body: 'Different text' }), note())).toBe(result)
  })

  it('evicts oldest snapshots to keep the complete workspace history below 2 MB', () => {
    const records: HistoryRecord[] = Array.from({ length: 23 }, (_, index) => ({ key: `${a}:older-${index}`, userId: a, noteId: `older-${index}`,
      snapshots: [{ id: String(index), title: 'Earlier', body: 'x'.repeat(90_000), savedAt: index + 1 }] }))
    const result = captureHistory(records, a, note({ body: 'y'.repeat(90_000) }), note({ body: 'Now' }))
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(2 * 1024 * 1024)
    expect(result.some(record => record.noteId === 'older-0')).toBe(false)
    expect(result.find(record => record.noteId === note().id)?.snapshots[0].body).toBe('y'.repeat(90_000))
  })
})

describe('note search text', () => {
  it('matches titles and bodies, reuses cached text and handles an empty query', () => {
    const item = note({ title: 'Release Notes', body: 'Fixed reminders' })
    expect(matchesNoteSearch(item, '')).toBe(true)
    expect(matchesNoteSearch(item, 'release')).toBe(true)
    expect(matchesNoteSearch(item, 'reminders')).toBe(true)
    expect(matchesNoteSearch(item, 'missing')).toBe(false)
    expect(matchesNoteSearch({ ...item, body: 'Different text' }, 'reminders')).toBe(false)
  })

  it('searches large notes without relying on the small-note cache', () => {
    const item = note({ body: `${'x'.repeat(70_000)} Find this ending` })
    expect(matchesNoteSearch(item, 'find this ending')).toBe(true)
    expect(matchesNoteSearch(item, 'missing')).toBe(false)
  })
})
