import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', async importOriginal => ({ ...await importOriginal<typeof import('@tauri-apps/api/core')>(), invoke: mocks.invoke }));
import { Update } from '@tauri-apps/plugin-updater';
import { checkNativeUpdate } from '../src/features/updates/nativeUpdater';

beforeEach(() => { mocks.invoke.mockReset(); });
describe('native updater bridge', () => {
  it('uses the existing SDK resource for downloads and installation', async () => {
    mocks.invoke.mockResolvedValue({ rid: 42, currentVersion: '0.1.3', version: '0.1.4', rawJson: { notes: 'release' } });
    const update = await checkNativeUpdate();
    expect(mocks.invoke).toHaveBeenCalledWith('check_app_update');
    expect(update).toBeInstanceOf(Update);
    expect(update?.rid).toBe(42);
    expect(update?.version).toBe('0.1.4');
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });
  it('preserves the up-to-date response and structured native failure', async () => {
    mocks.invoke.mockResolvedValue(null);
    expect(await checkNativeUpdate()).toBeNull();
    const error = { message: 'request failed', diagnostic: { category: 'timeout', causes: ['operation timed out'] } };
    mocks.invoke.mockRejectedValue(error);
    await expect(checkNativeUpdate()).rejects.toEqual(error);
  });
});
