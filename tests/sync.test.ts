import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateNotesReply } from '../src/features/notes/syncValidation'
import { note, timestamp, workspaceA as owner } from './fixtures'

beforeEach(() => vi.resetModules())

describe('sync response validation', () => {
  const valid = () => ({ cursor: '1', full: false, hasMore: false, changes: [], results: [] })
  it('accepts an empty incremental pull', () => expect(() => validateNotesReply(valid())).not.toThrow())
  it.each([
    { cursor: '-1' }, { cursor: '9'.repeat(21) }, { full: 'true' }, { hasMore: null },
    { changes: new Array(10001).fill(null) }, { results: new Array(51).fill(null) },
    { changes: [{ entity: 'user', id: note().id, snapshot: null }] },
    { changes: [{ entity: 'note', id: 'invalid', snapshot: null }] },
  ])('rejects malformed replies before persistence: %j', patch => {
    expect(() => validateNotesReply({ ...valid(), ...patch })).toThrow(/local notes have been kept/i)
  })
  it('rejects snapshots with mismatched IDs or invalid types', () => {
    const snapshot = { id: note().id, title: 'Note', content: {}, folder_id: null,
      is_pinned: false, is_draft: false, deleted_at: null, created_at: timestamp, updated_at: timestamp }
    const reply = { ...valid(), changes: [{ entity: 'note', id: note().id, snapshot }] }
    expect(() => validateNotesReply(reply)).not.toThrow()
    expect(() => validateNotesReply({ ...reply, changes: [{ ...reply.changes[0], snapshot: { ...snapshot, is_draft: 'false' } }] })).toThrow()
    expect(() => validateNotesReply({ ...reply, changes: [{ ...reply.changes[0], id: '33333333-3333-4333-8333-333333333333' }] })).toThrow()
  })
})

describe('durable sync acknowledgements', () => {
  it('keeps edits made after sending a batch and rebases them onto its acknowledgement', async () => {
    const { offlineStore: store } = await import('../src/features/notes/offlineStore')
    await store.putNote(owner, note(), null, true)
    const { batch } = await store.prepareBatch(owner)
    await store.putNote(owner, note({ body: 'Newest local edit' }), null)
    const reply = { cursor: '1', full: false, hasMore: false, changes: [], results: [{ revisionId: batch.operations[0].revisionId, status: 'applied' as const, snapshot: note({ version: 1 }) }] }
    const result = await store.commitBatch(owner, batch, reply)
    expect(result.notes[0].body).toBe('Newest local edit')
    expect(result.outbox).toHaveLength(1)
    expect(result.outbox[0].baseVersion).toBe(1)
    // Repeated replies must not retire the newer edit or rewind the cursor.
    await store.commitBatch(owner, batch, { ...reply, cursor: '0' })
    expect((await store.prepareBatch(owner)).cursor).toBe('1')
  })
  it('preserves divergent local edits as a conflict copy', async () => {
    const { offlineStore: store } = await import('../src/features/notes/offlineStore')
    await store.putNote(owner, note({ body: 'Local version' }), timestamp)
    const { batch } = await store.prepareBatch(owner)
    const result = await store.commitBatch(owner, batch, { cursor: '2', full: false, hasMore: false, changes: [], results: [
      { revisionId: batch.operations[0].revisionId, status: 'conflict', snapshot: note({ body: 'Server version', version: 2 }) },
    ] })
    expect(result.conflicts).toBe(1)
    expect(result.notes.find(item => item.id === note().id)?.body).toBe('Server version')
    expect(result.notes.find(item => item.id !== note().id)).toMatchObject({ body: 'Local version', title: 'A note (conflict copy)' })
    expect(result.outbox).toHaveLength(1)
  })
  it('aborts a partial acknowledgement without removing queued changes', async () => {
    const { offlineStore: store } = await import('../src/features/notes/offlineStore')
    await store.putNote(owner, note(), null, true)
    const { batch } = await store.prepareBatch(owner)
    await expect(store.commitBatch(owner, batch, { cursor: '9', full: false, hasMore: false, changes: [], results: [] })).rejects.toThrow()
    expect((await store.load(owner)).outbox).toHaveLength(1)
    expect((await store.prepareBatch(owner)).batch.id).toBe(batch.id)
  })
})
