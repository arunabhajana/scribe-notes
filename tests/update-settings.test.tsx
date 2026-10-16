import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), check: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: mocks.invoke }));
vi.mock('../src/features/updates/nativeUpdater', () => ({ checkNativeUpdate: mocks.check }));
import { WorkspacePreferencesContext } from '../src/features/settings/workspacePreferences';
import { UpdateSettings } from '../src/components/updates/UpdateSettings';
import { VersionDropdown } from '../src/components/updates/VersionDropdown';
import { updateActions } from '../src/features/updates/updateStore';
import { UpdateDiagnostics } from '../src/components/updates/UpdateDiagnostics';
import { formatUpdateDiagnostic } from '../src/features/updates/updateDiagnostics';

let workspace = 0;
let workspaceId: string;
beforeEach(() => {
  workspaceId = `offline-ui-${++workspace}`;
  mocks.invoke.mockReset().mockResolvedValue(true);
  mocks.check.mockReset().mockResolvedValue(null);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  // jsdom does not implement the native dialog methods/top layer.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  updateActions.setWorkspace(workspaceId, true);
});
const settings = () => render(<WorkspacePreferencesContext.Provider value={workspaceId}><UpdateSettings localOnly /></WorkspacePreferencesContext.Provider>);

describe('offline update consent', () => {
  it('keeps the switch off until confirmed, and cancel sends no request', () => {
    settings();
    const toggle = screen.getByRole('switch');
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(screen.getByRole('dialog')).toHaveTextContent('IP address');
    expect(screen.getByRole('dialog')).toHaveTextContent('does not enable cloud sync');
    expect(toggle).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Keep checks off' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toggle).not.toBeChecked();
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it('enables and checks only after confirmation', async () => {
    settings();
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Enable checks' }));
    await waitFor(() => expect(mocks.check).toHaveBeenCalledOnce());
    expect(screen.getByRole('switch')).toBeChecked();
    await waitFor(() => expect(screen.getByText('You’re up to date.')).toBeVisible());
  });
  it('shows a neutral release-feed notice and keeps manual checks available', async () => {
    mocks.check.mockRejectedValue('Could not fetch a valid release JSON from the remote');
    settings();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Draft and prerelease'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'View releases' })).toBeEnabled();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });
  it('keeps diagnostics hidden in settings while preserving the copyable component for later use', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const failure = { message: 'error sending request for url (https://github.com/owner/repo/latest.json)', diagnostic: {
      stage: 'check', category: 'timeout', nativeError: 'error sending request', causes: ['operation timed out'],
      elapsedMs: 60001, timeoutMs: 60000, endpoints: ['https://user:secret@github.com/owner/repo/latest.json?token=secret'],
    } };
    mocks.check.mockRejectedValue(failure);
    settings();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('too long'));
    expect(screen.queryByText('Update debug details')).toBeNull();
    const diagnostic = render(<UpdateDiagnostics report={formatUpdateDiagnostic(failure, 60001, 'check', true, false)} />);
    fireEvent.click(screen.getByText('Update debug details'));
    expect(screen.getByText(/Cause 1: operation timed out/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Copy debug details' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain('Elapsed: 60001 ms');
    expect(writeText.mock.calls[0][0]).not.toContain('secret');
    expect(screen.getByRole('switch')).not.toBeChecked();
    diagnostic.unmount();
    mocks.check.mockResolvedValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(screen.queryByText('Update debug details')).toBeNull());
  });
});

describe('custom version dropdown', () => {
  const options = [{ value: '1.0.2', label: '1.0.2 · Installed' }, { value: '1.0.1', label: '1.0.1' }];
  it('supports keyboard movement and Escape without dismissing its parent dialog', () => {
    render(<VersionDropdown value="1.0.2" options={options} onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Version: 1.0.2 · Installed' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: '1.0.2 · Installed' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: '1.0.1' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger).toHaveFocus();
  });
  it('selects a version and closes the custom list', () => {
    function Picker() { const [value, setValue] = useState('1.0.2'); return <VersionDropdown value={value} options={options} onChange={setValue} />; }
    render(<Picker />);
    fireEvent.click(screen.getByRole('button', { name: 'Version: 1.0.2 · Installed' }));
    fireEvent.click(screen.getByRole('option', { name: '1.0.1' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Version: 1.0.1' })).toBeVisible();
  });
});
