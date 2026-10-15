const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/;

type VersionFiles = {
  packageJson: { version: unknown };
  packageLock: { version?: unknown; packages?: Record<string, { version?: unknown }> };
  cargoManifest: string;
  cargoLock: string;
  tauriConfig: { version?: unknown };
  installerConfig: { version?: unknown };
};

export function validateVersions(files: VersionFiles, tag?: string): string {
  const version = files.packageJson.version;
  if (typeof version !== 'string') throw new Error('package.json must contain a valid semantic version.');
  const match = version.match(semver);
  if (!match || match[0] !== version || match[4]?.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    throw new Error('package.json must contain a valid semantic version.');
  }
  const manifestSection = files.cargoManifest.match(/^\[package\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
  const lockSection = files.cargoLock.match(/^\[\[package\]\]\r?\nname = "app"\r?\n([\s\S]*?)(?=^\[\[package\]\]|$(?![\s\S]))/m)?.[1];
  const cargoVersion = (section: string | undefined) => section?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const versions = {
    'package-lock.json': files.packageLock.version,
    'package-lock.json root package': files.packageLock.packages?.['']?.version,
    'src-tauri/Cargo.toml': cargoVersion(manifestSection),
    'src-tauri/Cargo.lock app package': cargoVersion(lockSection),
  };
  for (const [filename, value] of Object.entries(versions)) {
    if (value !== version) throw new Error(`${filename} differs from package.json. Run npm run sync:version and commit all version files.`);
  }
  if (files.tauriConfig.version !== '../package.json') throw new Error('Tauri must read its version from ../package.json.');
  if (files.installerConfig.version !== undefined && files.installerConfig.version !== version) throw new Error('Installer configuration overrides the package version.');
  if (tag !== undefined && tag !== `v${version}`) throw new Error('Release tag must exactly match v<package.json version>.');
  return version;
}

export function validateReleaseWebsite(value: string | undefined) {
  let url;
  try { url = new URL(value ?? ''); } catch { throw new Error('Set VITE_SCRIBE_WEBSITE_URL to the published HTTPS website before releasing.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Release legal links require a public HTTPS website URL without credentials, query or fragment.');
  }
}
