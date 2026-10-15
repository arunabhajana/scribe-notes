import { beforeEach, describe, expect, it, vi } from 'vitest'
const { rpc, abortSignal } = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }))
vi.mock('../src/features/auth/supabaseClient', () => ({ supabase: { rpc } }))
import { CLOUD_STORAGE_LIMIT_BYTES, CLOUD_STORAGE_LIMIT_MESSAGE, getCloudStorageUsage, isCloudStorageLimitError } from '../src/features/settings/cloudStorage'

beforeEach(() => {
  rpc.mockReturnValue({ abortSignal })
  abortSignal.mockResolvedValue({ data: { usedBytes: 100, noteBytes: 90, folderBytes: 10, limitBytes: CLOUD_STORAGE_LIMIT_BYTES }, error: null })
})
describe('cloud storage reporting', () => {
  it('uses the 2 MB allowance and gives actionable quota feedback', () => {
    expect(CLOUD_STORAGE_LIMIT_BYTES).toBe(2 * 1024 * 1024)
    expect(isCloudStorageLimitError(new Error('SCRIBE_STORAGE_LIMIT_REACHED'))).toBe(true)
    expect(isCloudStorageLimitError(new Error('Offline'))).toBe(false)
    expect(CLOUD_STORAGE_LIMIT_MESSAGE).toMatch(/saved locally/i)
    expect(CLOUD_STORAGE_LIMIT_MESSAGE).toMatch(/retry sync/i)
  })
  it('loads valid server-reported usage with an abort signal', async () => {
    expect((await getCloudStorageUsage()).usedBytes).toBe(100)
    expect(rpc).toHaveBeenCalledWith('get_cloud_storage_usage')
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal))
  })
  it.each([null, {}, { usedBytes: -1, noteBytes: 0, folderBytes: 0, limitBytes: 100 },
    { usedBytes: 0, noteBytes: 0, folderBytes: 0, limitBytes: 0 },
    { usedBytes: Infinity, noteBytes: 0, folderBytes: 0, limitBytes: 100 }])('rejects invalid usage %j', async data => {
    abortSignal.mockResolvedValue({ data, error: null })
    await expect(getCloudStorageUsage()).rejects.toThrow(/unavailable/i)
  })
  it('reports an actionable failure instead of displaying a fabricated zero', async () => {
    abortSignal.mockResolvedValue({ data: null, error: { message: 'Internal database detail' } })
    await expect(getCloudStorageUsage()).rejects.toThrow(/check your connection/i)
  })
})
