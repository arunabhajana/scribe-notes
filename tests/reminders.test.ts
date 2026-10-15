import { beforeEach, describe, expect, it, vi } from 'vitest'
import { note, workspaceA as a, workspaceB as b } from './fixtures'
beforeEach(() => vi.resetModules())
describe('local reminder storage', () => {
  it('isolates reminders and their deletion between workspaces', async () => {
    const { reminderStore: store } = await import('../src/features/reminders/reminderStore')
    await store.set(a, note().id, '2099-01-01T00:00:00.000Z', 5)
    await store.set(b, note().id, '2099-02-01T00:00:00.000Z', 10)
    await store.deleteWorkspace(a)
    expect((await store.load(a)).reminders).toEqual({})
    expect((await store.load(b)).reminders[note().id].leadMinutes).toBe(10)
    await expect(store.set(a, note().id, null, 0)).rejects.toThrow()
  })
  it('does not retire a newer edit when an earlier mutation is acknowledged', async () => {
    const { reminderStore: store } = await import('../src/features/reminders/reminderStore')
    const first = await store.set(a, note().id, '2099-01-01T00:00:00.000Z', 5)
    const next = await store.set(a, note().id, '2099-02-01T00:00:00.000Z', 10)
    const saved = await store.commit(a, { cursor: '1', full: false, hasMore: false,
      reminders: [first.reminders[note().id]], resolved: [], acknowledged: [first.pending[note().id].mutationId] })
    expect(saved.pending[note().id].mutationId).toBe(next.pending[note().id].mutationId)
    expect(saved.reminders[note().id].leadMinutes).toBe(10)
  })
  it('never rewinds the cursor on an out-of-order pull', async () => {
    const { reminderStore: store } = await import('../src/features/reminders/reminderStore')
    const reply = { cursor: '5', full: false, hasMore: false, reminders: [], resolved: [], acknowledged: [] }
    await store.commit(a, reply)
    expect((await store.commit(a, { ...reply, cursor: '2', full: true })).cursor).toBe('5')
  })
})
