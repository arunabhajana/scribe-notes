import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());

describe.each([true, false])('build isolation (development: %s)', development => {
  it('uses its own display labels and callback scheme', async () => {
    vi.stubEnv('DEV', development);
    const identity = await import('../src/features/appIdentity');
    expect(identity.appName).toBe(development ? 'Scribe Dev' : 'Scribe');
    expect(identity.buildLabel).toBe(development ? 'Development build' : 'Production build');
    expect(identity.authCallbackUrl).toBe(`${development ? 'com.scribe.notes.dev' : 'com.scribe.notes'}://auth/callback`);
  });

  it('keeps default capture shortcuts separate and preserves explicit choices', async () => {
    vi.stubEnv('DEV', development);
    const { defaultShortcutBindings, parseShortcutBindings, serializeShortcutBindings } = await import('../src/features/shortcuts/keyboardShortcuts');
    expect(defaultShortcutBindings.quickCapture).toEqual({ key: development ? 'd' : ' ', shift: true });
    const legacy = JSON.stringify({ quickCapture: { key: ' ', shift: true } });
    expect(parseShortcutBindings(legacy).quickCapture).toEqual(defaultShortcutBindings.quickCapture);
    const chosen = { ...defaultShortcutBindings, quickCapture: { key: ' ', shift: true } };
    expect(parseShortcutBindings(serializeShortcutBindings(chosen)).quickCapture).toEqual(chosen.quickCapture);
    expect(parseShortcutBindings(JSON.stringify({ quickCapture: { key: 'q', shift: true } })).quickCapture.key).toBe('q');
  });

  it('accepts notification links only for its own environment', async () => {
    vi.stubEnv('DEV', development);
    const { notificationTarget } = await import('../src/features/notifications/desktopNotifications');
    const ownScheme = development ? 'com.scribe.notes.dev' : 'com.scribe.notes';
    const otherScheme = development ? 'com.scribe.notes' : 'com.scribe.notes.dev';
    const userId = '11111111-1111-4111-8111-111111111111';
    expect(notificationTarget(`${ownScheme}://notifications/home?user=${userId}`)).toEqual({ userId, noteId: null });
    expect(notificationTarget(`${otherScheme}://notifications/home?user=${userId}`)).toBeNull();
  });
});
