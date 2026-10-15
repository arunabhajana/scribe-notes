import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workspaceA as a, workspaceB as b } from './fixtures'
beforeEach(() => vi.resetModules())
describe('export write barrier', () => {
  it('waits for unsaved workspace writes before continuing', async () => {
    const { registerLocalWriteBarrier, waitForWorkspaceWrites } = await import('../src/features/transfer/localWriteBarrier')
    let resolve!: () => void
    const pending = new Promise<void>(done => { resolve = done })
    registerLocalWriteBarrier(a, () => pending)
    const ready = vi.fn()
    const wait = waitForWorkspaceWrites(a).then(ready)
    await Promise.resolve()
    expect(ready).not.toHaveBeenCalled()
    resolve(); await wait
    expect(ready).toHaveBeenCalledOnce()
    await expect(waitForWorkspaceWrites(b)).rejects.toThrow(/not ready/i)
  })
  it('does not unregister a newer editor when an old editor unmounts', async () => {
    const { registerLocalWriteBarrier, waitForWorkspaceWrites } = await import('../src/features/transfer/localWriteBarrier')
    const removeOld = registerLocalWriteBarrier(a, async () => {})
    const newer = vi.fn(async () => {})
    const removeNew = registerLocalWriteBarrier(a, newer)
    removeOld(); await waitForWorkspaceWrites(a)
    expect(newer).toHaveBeenCalledOnce()
    removeNew()
    await expect(waitForWorkspaceWrites(a)).rejects.toThrow(/not ready/i)
  })
})
