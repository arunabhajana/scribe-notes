import { describe, expect, it } from 'vitest';
import { appScheme } from '../src/features/appIdentity';
import { updateNotificationAction } from '../src/features/updates/updateNotification';

describe('update notification navigation', () => {
  it('recognises only the two review actions for this app identity', () => {
    expect(updateNotificationAction(`${appScheme}://updates/install`)).toBe('install');
    expect(updateNotificationAction(`${appScheme}://updates/changelog`)).toBe('changelog');
  });
  it.each([
    'https://updates/install',
    'other-app://updates/install',
    `${appScheme}://updates/download`,
    `${appScheme}://updates/install?url=https://example.com/installer.exe`,
    `${appScheme}://updates/install#silent`,
    `${appScheme}://user:pass@updates/install`,
    `${appScheme}://updates:8000/install`,
    `${appScheme}://notifications/install`,
    'not a URL',
  ])('rejects untrusted navigation: %s', url => {
    expect(updateNotificationAction(url)).toBeNull();
  });
});
