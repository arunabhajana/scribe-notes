import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ check: vi.fn(), invoke: vi.fn(), native: vi.fn(() => true) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke, isTauri: mocks.native }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));

beforeEach(() => {
  vi.resetModules();
  mocks.invoke.mockReset().mockResolvedValue(true);
  mocks.check.mockReset();
  mocks.native.mockReturnValue(true);
});
const candidate = () => ({ version: '1.2.3', body: 'Brief update', rawJson: {}, download: vi.fn().mockResolvedValue(undefined), install: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) });

describe('updater lifecycle', () => {
  it('does not contact GitHub when automatic checks are disabled', async () => {
    const { updateActions } = await import('../src/features/updates/updateStore');
    updateActions.setAutomatic(false);
    await updateActions.check(false);
    expect(mocks.check).not.toHaveBeenCalled();
    mocks.check.mockResolvedValue(null);
    await updateActions.check(true);
    expect(mocks.check).toHaveBeenCalledOnce();
  });
  it('limits automatic checks but allows an explicit retry', async () => {
    mocks.check.mockResolvedValue(null);
    const { updateActions } = await import('../src/features/updates/updateStore');
    await updateActions.check(false); await updateActions.check(false);
    expect(mocks.check).toHaveBeenCalledOnce();
    await updateActions.check(true);
    expect(mocks.check).toHaveBeenCalledTimes(2);
  });
  it('never installs from a check or Later; the pending update remains downloadable', async () => {
    const update = candidate(); mocks.check.mockResolvedValue(update);
    const { updateActions } = await import('../src/features/updates/updateStore');
    await updateActions.check(); updateActions.later();
    await updateActions.install();
    expect(update.install).not.toHaveBeenCalled();
    await updateActions.download();
    expect(update.download).toHaveBeenCalledOnce();
    await updateActions.install();
    expect(mocks.invoke).toHaveBeenCalledWith('prepare_app_update');
    expect(update.install).toHaveBeenCalledWith({ restartAfterInstall: true });
  });
  it('refuses installation if verification/download fails', async () => {
    const update = candidate(); update.download.mockRejectedValue(new Error('invalid signature'));
    mocks.check.mockResolvedValue(update);
    const { updateActions } = await import('../src/features/updates/updateStore');
    await updateActions.check(); await updateActions.download(); await updateActions.install();
    expect(update.install).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalledWith('prepare_app_update');
  });
  it('stops installation when a draft or local write cannot be saved and releases capture', async () => {
    const update = candidate(); mocks.check.mockResolvedValue(update);
    const { updateActions } = await import('../src/features/updates/updateStore');
    const { registerUpdateGuard } = await import('../src/features/updates/installSafety');
    registerUpdateGuard(() => { throw new Error('Unsaved draft'); });
    await updateActions.check(); await updateActions.download(); await updateActions.install();
    expect(update.install).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledWith('finish_app_update');
  });
  it('stops installation while Quick Capture is open', async () => {
    const update = candidate(); mocks.check.mockResolvedValue(update);
    const { updateActions } = await import('../src/features/updates/updateStore');
    await updateActions.check(); await updateActions.download();
    mocks.invoke.mockImplementation(command => command === 'prepare_app_update' ? Promise.reject('Close capture') : Promise.resolve(true));
    await updateActions.install();
    expect(update.install).not.toHaveBeenCalled();
  });
  it('keeps a downloaded update after failed preflight and allows retry', async () => {
    const update = candidate(); mocks.check.mockResolvedValue(update);
    const { updateActions } = await import('../src/features/updates/updateStore');
    const { registerUpdateGuard } = await import('../src/features/updates/installSafety');
    const unregister = registerUpdateGuard(() => { throw new Error('Unsaved draft'); });
    await updateActions.check(); await updateActions.download(); await updateActions.install();
    unregister(); await updateActions.install();
    expect(update.download).toHaveBeenCalledOnce();
    expect(update.install).toHaveBeenCalledOnce();
  });
  it('does not make a network request from an unsigned development build', async () => {
    mocks.invoke.mockResolvedValue(false);
    const { updateActions } = await import('../src/features/updates/updateStore');
    await updateActions.check();
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it('does not launch overlapping checks', async () => {
    let complete!: (value: null) => void;
    mocks.check.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const { updateActions } = await import('../src/features/updates/updateStore');
    const first = updateActions.check(); await Promise.resolve();
    await updateActions.check();
    expect(mocks.check).toHaveBeenCalledOnce();
    complete(null); await first;
  });
});
