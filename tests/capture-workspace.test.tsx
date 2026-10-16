import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: native.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }));
const offlineId = '11111111-1111-4111-8111-111111111111';
let activeAccount: string | null;
beforeEach(() => {
  vi.resetModules();
  activeAccount = null;
  native.invoke.mockReset().mockImplementation(async (command, args) => {
    if (command === 'set_capture_account') activeAccount = args.userId;
    if (command === 'get_capture_account') return activeAccount;
  });
  native.listen.mockReset().mockResolvedValue(() => undefined);
});

describe('native workspace handoff', () => {
  it('registers an offline workspace before enabling capture or configuring notifications', async () => {
    const { useQuickCapture, waitForCaptureAccount } = await import('../src/features/capture/captureBridge');
    const { configureDesktopNotifications } = await import('../src/features/notifications/desktopNotifications');
    const error = vi.fn();
    renderHook(() => useQuickCapture(offlineId, { key: 'Space', shift: true }, true, error));
    await waitForCaptureAccount();
    await configureDesktopNotifications({ userId: offlineId, enabled: true, desktop: true, remindersEnabled: true, sound: false, reminders: [] });
    expect(activeAccount).toBe(offlineId);
    const commands = native.invoke.mock.calls.map(call => call[0]);
    expect(commands.indexOf('get_capture_account')).toBeLessThan(commands.indexOf('configure_desktop_notifications'));
    await waitFor(() => expect(native.invoke).toHaveBeenCalledWith('set_capture_enabled', { enabled: true }));
    expect(error).not.toHaveBeenCalled();
  });

  it('does not let a slow startup reset overwrite the offline workspace', async () => {
    const implementation = native.invoke.getMockImplementation()!;
    let releaseReset!: () => void;
    native.invoke.mockImplementation(async (command, args) => {
      if (command === 'set_capture_account' && args.userId === null) {
        await new Promise<void>(resolve => { releaseReset = resolve; });
      }
      return implementation(command, args);
    });
    const { useQuickCapture, waitForCaptureAccount } = await import('../src/features/capture/captureBridge');
    const error = vi.fn();
    const { rerender } = renderHook(({ id }: { id: string | null }) => useQuickCapture(id, { key: 'Space', shift: true }, false, error), { initialProps: { id: null as string | null } });
    await waitFor(() => expect(releaseReset).toBeTypeOf('function'));
    rerender({ id: offlineId });
    await act(async () => { releaseReset(); await waitForCaptureAccount(); });
    expect(activeAccount).toBe(offlineId);
    expect(native.invoke.mock.calls.filter(call => call[0] === 'set_capture_account').map(call => call[1].userId)).toEqual([null, offlineId]);
  });

  it('retries a transient registration failure without poisoning notification startup', async () => {
    const implementation = native.invoke.getMockImplementation()!;
    let failed = false;
    native.invoke.mockImplementation(async (command, args) => {
      if (command === 'set_capture_account' && !failed) { failed = true; throw new Error('Native startup is not ready'); }
      return implementation(command, args);
    });
    const { useQuickCapture, waitForCaptureAccount } = await import('../src/features/capture/captureBridge');
    const error = vi.fn();
    renderHook(() => useQuickCapture(offlineId, { key: 'Space', shift: true }, false, error));
    await waitForCaptureAccount();
    expect(activeAccount).toBe(offlineId);
    expect(error).not.toHaveBeenCalled();
  });

  it('repairs lost native state when capture opens', async () => {
    const { useQuickCapture, waitForCaptureAccount } = await import('../src/features/capture/captureBridge');
    renderHook(() => useQuickCapture(offlineId, { key: 'Space', shift: true }, false, vi.fn()));
    await waitForCaptureAccount();
    activeAccount = null;
    const onOpen = native.listen.mock.calls.find(call => call[0] === 'scribe:capture-prepare')![1];
    await act(async () => { onOpen(); await waitForCaptureAccount(); });
    expect(activeAccount).toBe(offlineId);
  });
});
