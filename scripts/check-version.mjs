import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateReleaseWebsite, validateVersions } from './lib/version-validation.mts';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const release = process.argv.includes('--release');
const tag = release ? process.env.GITHUB_REF_NAME : undefined;
if (release && (process.env.GITHUB_REF_TYPE !== 'tag' || !tag)) throw new Error('Release validation must run for a version tag.');
const version = validateVersions({
  packageJson: JSON.parse(read('package.json')),
  packageLock: JSON.parse(read('package-lock.json')),
  cargoManifest: read('src-tauri/Cargo.toml'),
  cargoLock: read('src-tauri/Cargo.lock'),
  tauriConfig: JSON.parse(read('src-tauri/tauri.conf.json')),
  installerConfig: JSON.parse(read('src-tauri/tauri.installer.conf.json')),
}, tag);
if (release) {
  // Full checkout fetches main and tags. Never interpolate a tag into shell code.
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main'], { stdio: 'pipe' });
  } catch {
    throw new Error('Release commit must already be on origin/main. Use a full checkout and tag the merged main commit.');
  }
  const taggedCommit = execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], { encoding: 'utf8' }).trim();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (taggedCommit !== head) throw new Error('The release checkout does not match the version tag.');
  validateReleaseWebsite(process.env.VITE_SCRIBE_WEBSITE_URL);
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nprerelease=${Boolean(version.split('+')[0].includes('-'))}\ncommit=${head}\n`);
  }
}
console.log(release ? 'Version tag, main ancestry, version files and release website validated.' : 'All committed version files are consistent.');
