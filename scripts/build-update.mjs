import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseChangelog, changelogMarkdown } from './lib/changelog.mts';
import { verifyUpdateSignature } from './lib/update-signature.mts';

// Trusted tag builds only. The private key is passed to the native bundler as a
// process environment variable; it is never copied into JSON or VITE_ variables.
const root = process.cwd();
const output = resolve(root, 'release-files');
if (existsSync(output) && readdirSync(output).length) throw new Error('Move the previous release-files folder aside before building another signed release.');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const log = parseChangelog(JSON.parse(readFileSync(resolve(root, `changelogs/${version}.json`), 'utf8')), version);
const pubkey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();
if (!pubkey) throw new Error('Set the TAURI_UPDATER_PUBLIC_KEY repository variable before a signed release.');
const publicText = Buffer.from(pubkey, 'base64').toString('utf8');
const keyLine = publicText.trim().split(/\r?\n/).at(-1);
if (!publicText.startsWith('untrusted comment:') || !keyLine || Buffer.from(keyLine, 'base64').length !== 42) {
  throw new Error('TAURI_UPDATER_PUBLIC_KEY must contain the full contents of the Tauri .pub file.');
}
if (!process.env.TAURI_SIGNING_PRIVATE_KEY) throw new Error('Set the TAURI_SIGNING_PRIVATE_KEY GitHub Actions secret.');
const repository = process.env.GITHUB_REPOSITORY || 'arunabhajana/scribe-notes';
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid release repository.');
if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== `v${version}`) throw new Error('Release tag must match the package version.');
const installer = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.installer.conf.json'), 'utf8'));
mkdirSync(resolve(root, 'tmp'), { recursive: true });
const config = resolve(root, 'tmp/tauri-update.conf.json');
writeFileSync(config, JSON.stringify({ ...installer,
  bundle: { ...installer.bundle, createUpdaterArtifacts: true },
  plugins: { updater: { pubkey, endpoints: [`https://github.com/${repository}/releases/latest/download/latest.json`], windows: { installMode: 'passive' } } }
}, null, 2));
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'build', '--config', config, '--bundles', 'nsis', '--ci', '--', '--locked'], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const bundle = resolve(root, 'src-tauri/target/release/bundle/nsis');
const assets = readdirSync(bundle).filter(name => name.endsWith('-setup.exe') && name.includes(`_${version}_x64-`));
if (assets.length !== 1) throw new Error('Expected one matching signed Windows x64 installer.');
const name = assets[0];
const signature = readFileSync(resolve(bundle, `${name}.sig`), 'utf8').trim();
if (!signature || signature.length > 4096) throw new Error('Missing or invalid update signature.');
verifyUpdateSignature(readFileSync(resolve(bundle, name)), pubkey, signature);
mkdirSync(output, { recursive: true });
copyFileSync(resolve(bundle, name), resolve(output, name));
copyFileSync(resolve(bundle, `${name}.sig`), resolve(output, `${name}.sig`));
const manifest = { version, notes: log.summary, pub_date: new Date().toISOString(), changelog: log,
  platforms: { 'windows-x86_64': { url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(name)}`, signature } } };
writeFileSync(resolve(output, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(resolve(output, 'changelog.json'), JSON.stringify(log, null, 2) + '\n');
writeFileSync(resolve(output, 'release-notes.md'), changelogMarkdown(log));
const hashFiles = [name, `${name}.sig`, 'latest.json', 'changelog.json'];
writeFileSync(resolve(output, 'SHA256SUMS.txt'), hashFiles.map(file => `${createHash('sha256').update(readFileSync(resolve(output, file))).digest('hex')}  ${basename(file)}`).join('\n') + '\n');
console.log(`Signed update assets are ready in release-files for Scribe ${version}.`);
