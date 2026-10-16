import { parseChangelog, type Changelog } from '../../../scripts/lib/changelog.mts';
import packageInfo from '../../../package.json';

export const appVersion = packageInfo.version;
const files = import.meta.glob('../../../changelogs/*.json', { eager: true, import: 'default' });
export const changelogs: Changelog[] = Object.values(files).map(value => parseChangelog(value)).sort((a, b) =>
  b.version.localeCompare(a.version, undefined, { numeric: true }));
export const currentChangelog = changelogs.find(log => log.version === appVersion);

// Release notes are display-only text; they never control URLs, keys or installation.
export function updateChangelog(raw: unknown, version: string): Changelog | null {
  try { return parseChangelog(raw, version); } catch { return null; }
}
