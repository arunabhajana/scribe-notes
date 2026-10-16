import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePreferencesContext, readWorkspacePreference } from '../src/features/settings/workspacePreferences';
import { useWorkspaceTour, workspaceTourEvent } from '../src/features/onboarding/useWorkspaceTour';
import WorkspaceTour from '../src/components/onboarding/WorkspaceTour';
import { workspaceTourSteps } from '../src/features/onboarding/tourSteps';
vi.mock('../src/features/updates/updateStore', () => ({ useUpdates: () => ({ automatic: false }) }));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
const tourProps = {
  displayName: 'Alex', localOnly: true, shortcut: 'Ctrl + Shift + Space', cloudSync: false,
  quickCapture: true, reminders: true, desktopNotifications: true, launch: false, tray: false,
  dark: true, accentColor: '#8970ed', step: 'welcome', composerOpen: false,
  onStepChange: vi.fn(), onNavigate: vi.fn(), onClose: vi.fn(), onFinish: vi.fn(),
};

describe('workspace welcome tour', () => {
  it('waits for the workspace and remembers dismissal separately for each account', () => {
    const start = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => <WorkspacePreferencesContext.Provider value="offline-a">{children}</WorkspacePreferencesContext.Provider>;
    const hook = renderHook(({ ready }) => useWorkspaceTour(ready, start), { wrapper, initialProps: { ready: false } });
    expect(hook.result.current.open).toBe(false);
    act(() => window.dispatchEvent(new Event(workspaceTourEvent)));
    expect(start).toHaveBeenCalledOnce();
    expect(hook.result.current.open).toBe(false);
    hook.rerender({ ready: true });
    expect(hook.result.current.open).toBe(true);
    act(() => hook.result.current.goTo('windows'));
    act(() => hook.result.current.close());
    expect(hook.result.current.open).toBe(false);
    expect(readWorkspacePreference('offline-a', 'scribe-welcome-tour-v1')).toBe('seen');
    expect(readWorkspacePreference('online-b', 'scribe-welcome-tour-v1')).toBeNull();
    act(() => window.dispatchEvent(new Event(workspaceTourEvent)));
    expect(start).toHaveBeenCalledTimes(2);
    expect(hook.result.current.open).toBe(true);
    expect(hook.result.current.step).toBe('welcome');
    hook.unmount();
    const again = renderHook(() => useWorkspaceTour(true, start), { wrapper });
    expect(again.result.current.open).toBe(false);
    const other = renderHook(() => useWorkspaceTour(true, start), { wrapper: ({ children }) => <WorkspacePreferencesContext.Provider value="online-b">{children}</WorkspacePreferencesContext.Provider> });
    expect(other.result.current.open).toBe(true);
  });

  it('keeps offline users local and visits update settings without enabling features', () => {
    expect(workspaceTourSteps(true, tourProps.shortcut)).toHaveLength(15);
    expect(workspaceTourSteps(false, tourProps.shortcut)).toHaveLength(15);
    const navigate = vi.fn(), close = vi.fn(), move = vi.fn();
    const { rerender } = render(<WorkspaceTour {...tourProps} onClose={close} onNavigate={navigate} onStepChange={move} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('without an online account');
    expect(screen.queryByRole('button', { name: /sign in|create account/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show me around' }));
    expect(move).toHaveBeenCalledWith('new-note');
    rerender(<WorkspaceTour {...tourProps} step="updates" onClose={close} onNavigate={navigate} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Automatic checks are off');
    expect(screen.getByRole('dialog')).toHaveTextContent('doesn’t upload your notes');
    expect(navigate).toHaveBeenCalledWith('about');
    expect(localStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(close).toHaveBeenCalledOnce();
  });
  it('advances from a real category click and explains cloud sync without switching it on', async () => {
    const navigate = vi.fn(), move = vi.fn();
    const { rerender } = render(<><button data-tour="settings-general">General</button><WorkspaceTour {...tourProps} localOnly={false} step="general-nav" onNavigate={navigate} onStepChange={move} /></>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'General' })).toHaveAttribute('aria-describedby', 'workspace-tour-description'));
    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(move).toHaveBeenCalledWith('transfer');
    rerender(<WorkspaceTour {...tourProps} localOnly={false} step="transfer" onNavigate={navigate} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Cloud sync is off');
    expect(navigate).toHaveBeenCalledWith('general');
    expect(localStorage.length).toBe(0);
  });
});
