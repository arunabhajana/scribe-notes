import { appScheme } from '../appIdentity';

// Protocol URLs can come from outside Scribe. They may open review UI only;
// they never authorize network access, downloading, installation or a URL.
export function updateNotificationAction(raw: string): 'install' | 'changelog' | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== `${appScheme}:` || url.hostname !== 'updates' || url.username || url.password || url.port || url.search || url.hash) return null;
    return url.pathname === '/install' ? 'install' : url.pathname === '/changelog' ? 'changelog' : null;
  } catch { return null; }
}
