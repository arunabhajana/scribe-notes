# Scribe release checklist

Use this checklist for every new version. Commands are for **PowerShell**, run from the repository folder. Stop if a command fails; fix it before continuing. These examples do not run anything automatically.

**Every release:** prepare a version branch → update version and changelog → checks → PR → merge → tag → review draft → publish.

## One-time setup

Skip this section once configured. Do not generate new signing keys for each release.

- [ ] GitHub `main` requires passing PR checks.
- [ ] GitHub environment **`release`** exists and permits version tags (`v*`).
- [ ] Environment secrets are set: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- [ ] Repository variable `TAURI_UPDATER_PUBLIC_KEY` contains the matching public key.
- [ ] Repository variables for Supabase and `VITE_SCRIBE_WEBSITE_URL` are correct. The website’s `/terms` and `/privacy` pages work.
- [ ] The permanent signing key and its password have a secure backup outside the repository.

## 1. Start from current main

- [ ] Feature/fix PRs for this release are merged.
- [ ] Your working directory is clean: `git status --short` prints nothing. Commit current work on its own branch first if needed.

```powershell
cd E:\Projects\scribe-windows\scribe-windows
git status --short
```

When clean:

```powershell
git switch main
git pull --ff-only origin main
```

## 2. Choose the new version and create a branch

- [ ] Replace `0.1.2` below with the version you want. Do not include `v` here.

| Change | Example |
| --- | --- |
| Bug fixes | `1.0.0` → `1.0.1` |
| New features | `1.0.1` → `1.1.0` |
| Breaking changes | `1.1.0` → `2.0.0` |
| Test prerelease | `1.1.0-rc.1` |

```powershell
$scribeVersion = "0.1.2"
$scribePreviousVersion = node -p "require('./package.json').version"
git switch -c "release/$scribeVersion"
```

Keep this PowerShell window open so the variables remain available.

## 3. Bump the version

```powershell
npm version $scribeVersion --no-git-tag-version
```

- [ ] The command succeeded. It updates these four files through the existing sync script:

```text
package.json
package-lock.json
src-tauri/Cargo.toml
src-tauri/Cargo.lock
```

Use `--no-git-tag-version` as shown: the tag comes after the PR is merged. You do not need to edit the four version fields manually.

## 4. Write the changelog

Copy the previous version’s file as a starting point. If the destination already exists, edit it instead of copying over it.

```powershell
if (!(Test-Path "changelogs/$scribeVersion.json")) {
    Copy-Item "changelogs/$scribePreviousVersion.json" "changelogs/$scribeVersion.json"
}
notepad "changelogs/$scribeVersion.json"
```

- [ ] Set `version` to the new version, without `v`.
- [ ] Write a short `title`.
- [ ] Write a brief `summary` (maximum 240 characters). This appears in the update notification.
- [ ] Replace the copied section items with this release’s actual changes. Remove unused sections.
- [ ] Keep old changelog files: they provide the version history in What’s New.

Example:

```json
{
  "schemaVersion": 1,
  "version": "0.1.2",
  "title": "A smoother writing experience",
  "summary": "Better editing and several bug fixes.",
  "sections": [
    {
      "type": "improved",
      "items": ["Describe an improvement users will notice."]
    },
    {
      "type": "fixed",
      "items": ["Describe a bug fixed in this version."]
    }
  ]
}
```

Allowed types: `feature`, `improved`, `fixed`, `security`, `changed`. Use each type at most once. The full notes appear in What’s New and the GitHub release description; one JSON file supplies all of them.

## 5. Check the release changes

```powershell
npm run check
npm run check:native
```

- [ ] Both commands passed. The first includes version/changelog validation, lint, types, tests, security checks and a frontend build.
- [ ] Open the app and check the changed features, offline notes, and **Settings → About → What’s New**.
- [ ] Update user-facing documentation or website text if features, storage, privacy or requirements changed. Routine version releases do not require changing those pages.

## 6. Commit and open a PR

Stage the version files and new changelog explicitly:

```powershell
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock "changelogs/$scribeVersion.json"
git diff --cached --stat
git diff --cached
```

- [ ] Review the staged diff. Stage any intentional documentation changes separately by filename.

```powershell
git commit -m "chore: release $scribeVersion"
git push -u origin "release/$scribeVersion"
```

- [ ] On GitHub, open a PR from `release/<version>` into `main`.
- [ ] Wait for **Frontend checks** and **Windows x64 installer** to pass.
- [ ] Review the PR, then **Squash and merge**. You can delete the remote release branch afterward.

## 7. Tag the merged main commit

Run this only after the release PR is merged. If you opened a new terminal, the version is read from `package.json` again below.

```powershell
git switch main
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw "Pull failed. Stop before tagging." }
if (git status --porcelain) { throw "Working directory is not clean. Stop before tagging." }

npm run version:check
if ($LASTEXITCODE -ne 0) { throw "Version check failed. Stop before tagging." }
npm run changelog:check
if ($LASTEXITCODE -ne 0) { throw "Changelog check failed. Stop before tagging." }

$scribeVersion = node -p "require('./package.json').version"
$scribeTag = "v$scribeVersion"
git log -1 --oneline
git ls-remote --tags origin "refs/tags/$scribeTag" "refs/tags/$scribeTag^{}"
git tag --list "$scribeTag"
```

- [ ] The printed version is the intended release and the latest commit is the merged release.
- [ ] Both tag-list commands print nothing. If that tag exists, stop and inspect it; do not replace it.

Then create and push **only this tag**:

```powershell
git tag -a "$scribeTag" -m "Scribe $scribeVersion"
if ($LASTEXITCODE -ne 0) { throw "Tag creation failed. Do not push." }
git push origin "$scribeTag"
```

## 8. Wait for the draft release

- [ ] Open GitHub → **Actions → Release** for the pushed tag.
- [ ] Approve the `release` environment job if you configured approval.
- [ ] Wait for validation, CI, signed build and draft creation to succeed.
- [ ] Open GitHub → **Releases** and find the generated draft.

The workflow builds/signs automatically. It should attach:

```text
Scribe_<version>_x64-setup.exe
Scribe_<version>_x64-setup.exe.sig
latest.json
changelog.json
SHA256SUMS.txt
```

You do not need to build locally, edit `latest.json`, sign files manually or upload replacement assets for a normal release. Distribute the signed release installer, rather than the ordinary PR/CI review installer.

## 9. Review and publish

- [ ] The draft’s title, version and notes are correct.
- [ ] All six assets above are present and match the version.
- [ ] Download the draft installer and test it on a test Windows account or VM. Check launching, notes, settings and changed features.
- [ ] Review upgrade behavior and data preservation. The first updater rollout needs an actual test between two signed installed versions, using the same key and an isolated test release feed.
- [ ] For a stable release, publish it as the latest release. For an `-rc` version, keep the prerelease designation; it does not feed the stable updater.

After publication:

- [ ] The public release page and installer download work.
- [ ] From a previous updater-enabled installation, **About → Check for updates** finds the newer stable version.
- [ ] Check **Later → About**, download/install, retained notes/preferences, and the once-only What’s New screen.

Versions without updater support need one manual installation of an updater-enabled release first. If a published release has a code defect, fix it with a new PR/version/tag; do not move the old tag or replace its signed installer.

## If something fails

| Problem | Action |
| --- | --- |
| Version or changelog mismatch | Fix the files on the release branch, run checks and push to the same PR. |
| Signing job waiting | Review the GitHub environment approval and allowed tag rule. |
| Missing key/variable or wrong password | Correct the GitHub configuration, then rerun failed jobs. Keep the existing tag. |
| Source-code failure after tagging | Fix through a PR and create a new version/tag. |
| Draft already exists | Inspect the existing draft; the workflow deliberately refuses to overwrite it. |
| App does not find an update | Confirm it is a newer published stable release, `latest.json` exists, and the installed app came from the signed release build. |

## Compact checklist for next time

- [ ] Merge feature/fix PRs; start from clean, updated `main`.
- [ ] Create `release/<version>`.
- [ ] Run `npm version <version> --no-git-tag-version`.
- [ ] Add `changelogs/<version>.json` and update any affected documentation.
- [ ] Run `npm run check` and `npm run check:native`.
- [ ] Commit, push, open PR, wait for CI, squash and merge.
- [ ] Pull `main`, verify the version and confirm the tag is unused.
- [ ] Create and push `v<version>`.
- [ ] Wait for Release workflow; review/test the draft.
- [ ] Publish and verify the update from an older installation.
