import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateReleaseWebsite, validateVersions } from '../scripts/lib/version-validation.mts'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
function files(version = '1.2.3') {
  return {
    packageJson: { version },
    packageLock: { version, packages: { '': { version } } },
    cargoManifest: `[package]\nname = "app"\nversion = "${version}"\n\n[dependencies]\nserde = "1"\n`,
    cargoLock: `[[package]]\nname = "app"\nversion = "${version}"\n\n[[package]]\nname = "dependency"\nversion = "9.9.9"\n`,
    tauriConfig: { version: '../package.json' },
    installerConfig: {} as { version?: string },
  }
}
describe('CI version and release validation', () => {
  it('checks the actual committed version files', () => {
    expect(validateVersions({
      packageJson: JSON.parse(read('package.json')),
      packageLock: JSON.parse(read('package-lock.json')),
      cargoManifest: read('src-tauri/Cargo.toml'), cargoLock: read('src-tauri/Cargo.lock'),
      tauriConfig: JSON.parse(read('src-tauri/tauri.conf.json')),
      installerConfig: JSON.parse(read('src-tauri/tauri.installer.conf.json')),
    })).toBe(JSON.parse(read('package.json')).version)
  })
  it.each(['1.2.3', '1.2.3-rc.1', '1.2.3+build.2'])('accepts a matching v%s tag', version => {
    expect(validateVersions(files(version), `v${version}`)).toBe(version)
  })
  it.each(['01.2.3', '1.2', '1.2.3-01', 'v1.2.3', '1.2.3;echo unsafe', '1.2.3\n'])('rejects invalid version %s', version => {
    expect(() => validateVersions(files(version))).toThrow(/semantic version/i)
  })
  it.each(['1.2.3', 'v2.0.0', 'v1.2.3-rc.1', 'v1.2.3\n'])('rejects a mismatched tag %j', tag => {
    expect(() => validateVersions(files(), tag)).toThrow(/tag must exactly match/i)
  })
  it('detects drift in each independently committed version file', () => {
    const cases = [files(), files(), files(), files()]
    cases[0].packageLock.version = '2.0.0'
    cases[1].packageLock.packages[''].version = '2.0.0'
    cases[2].cargoManifest = cases[2].cargoManifest.replace('1.2.3', '2.0.0')
    cases[3].cargoLock = cases[3].cargoLock.replace('1.2.3', '2.0.0')
    for (const data of cases) expect(() => validateVersions(data)).toThrow(/sync:version/i)
  })
  it('rejects hardcoded Tauri version overrides', () => {
    const data = files(); data.tauriConfig.version = '1.2.3'
    expect(() => validateVersions(data)).toThrow(/read its version/i)
    const other = files(); other.installerConfig.version = '2.0.0'
    expect(() => validateVersions(other)).toThrow(/overrides/i)
  })
  it('rejects missing Cargo sections instead of accepting a dependency version', () => {
    const data = files(); data.cargoManifest = '[dependencies]\nversion = "1.2.3"\n'
    expect(() => validateVersions(data)).toThrow()
  })
  it('handles CRLF Cargo files', () => {
    const data = files()
    data.cargoManifest = data.cargoManifest.replaceAll('\n', '\r\n')
    data.cargoLock = data.cargoLock.replaceAll('\n', '\r\n')
    expect(validateVersions(data)).toBe('1.2.3')
  })
  it('accepts a published HTTPS legal website', () => {
    expect(() => validateReleaseWebsite('https://scribe.example.com')).not.toThrow()
  })
  it.each([undefined, '', 'http://localhost:4321', 'https://localhost', 'https://user:pass@example.com', 'https://example.com?x=1', 'https://example.com#terms'])('rejects unsuitable release legal links %j', url => {
    expect(() => validateReleaseWebsite(url)).toThrow()
  })
})
