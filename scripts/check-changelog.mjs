import { readFileSync, readdirSync } from 'node:fs';
import { parseChangelog } from './lib/changelog.mts';
const root = new URL('../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const files = readdirSync(new URL('changelogs/', root)).filter(name => name.endsWith('.json'));
for (const name of files) parseChangelog(JSON.parse(readFileSync(new URL(`changelogs/${name}`, root), 'utf8')), name.slice(0, -5));
if (!files.includes(`${version}.json`)) throw new Error(`Add changelogs/${version}.json before building this version.`);
console.log(`Validated ${files.length} changelog(s), including ${version}.`);
