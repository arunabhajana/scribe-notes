# Scribe for Windows

**A modern, minimal, cross-platform notes app.**

Scribe is a desktop note-taking application designed to help you capture ideas, organize information, and access your notes across devices. Built with Tauri and React, Scribe combines a lightweight desktop experience with cloud-backed synchronization powered by Supabase.

> **Project status:** In development

## Tests and build checks

Run `npm test` for automated tests, or `npm run check` for the full frontend CI gate (version consistency, lint, types, coverage tests, security checks, and production build). Run `npm run check:native` for the Rust/Tauri compilation check on Windows. See [CI and releases](#ci-and-releases) for GitHub setup.

## CI and releases

### How it works

- Temporary `feat/*`, `fix/*`, and `release/*` branches merge into `main` through pull requests.
- Every PR to `main` runs **Frontend checks** and **Windows x64 installer**. These checks also run after merges to `main` and can be started manually from Actions. There are no path filters that silently skip checks.
- The frontend job validates committed versions, lint, application/test types, tests and coverage floors, security regressions, secret patterns, and the production frontend build.
- The Windows job uses Windows Server 2022/MSVC and Rust 1.95.0, compile-checks native code, then builds the branded NSIS installer using locked Cargo dependencies. It does not execute the installer.
- A pushed `v<version>` tag must match the committed project version and refer to a commit already on `main`. The release workflow reruns both jobs, then creates a **draft GitHub release** with the Windows x64 installer, SHA-256 checksum, and generated release notes. Versions such as `1.0.0-rc.1` are marked as prereleases.
- Ordinary PRs and pushes never publish a release. Installer signing, in-app updater configuration, Supabase deployments, ARM64 and other platforms are not included yet. Installers remain unsigned until Windows code signing is configured.

### One-time GitHub setup

1. Enable GitHub Actions under **Settings > Actions > General**, allowing the official `actions/*` actions used in these workflows. Keep the default token permission read-only; the draft-release job explicitly requests its required `contents: write` permission. Repository/organization policy must permit this request.
2. Under **Settings > Secrets and variables > Actions > Variables**, add these **repository variables**:

   | Variable | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Your HTTPS Supabase project URL, matching the HTTPS/WSS origins in `src-tauri/tauri.conf.json`. |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase's public **publishable** client key. Alternatively set `VITE_SUPABASE_ANON_KEY` for a legacy **anon** key. Publishable takes precedence. |
   | `VITE_SCRIBE_WEBSITE_URL` | Your public HTTPS Scribe website, without a query or fragment. Optional for PR checks; required before release tags, so released legal links do not point to localhost. |

   These values are embedded in the public desktop build. Never use a secret/service-role key. No personal GitHub token or Supabase CLI is required. Tests use mocks and do not access the live project.

3. Commit and push the workflows, scripts, tests, `.node-version`, configuration, and lockfiles. After the first successful PR run, protect `main` and require both actual job names shown by GitHub: **Frontend checks** and **Windows x64 installer**. Require PRs, conversation resolution, and up-to-date branches; block force pushes/deletion and apply requirements to bypass roles too. Solo developers should not require another person's approval. CI cannot prevent merging until these repository rules are enabled.
4. Protect `v*` release tags with a tag ruleset: restrict creation to release maintainers and prevent tag updates/deletion. Never move a released tag.

If existing protection blocks the initial workflow PR because the checks do not exist yet, finish that bootstrap PR before selecting the newly available check names.

### Versioning and releasing

On your temporary version branch:

```powershell
npm version 1.0.0 --no-git-tag-version
```

Commit `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` together. For manual package edits, run `npm run sync:version` first. CI detects version drift before build hooks can repair it.

After the version PR merges, start from a clean working tree:

```powershell
git switch main
git pull --ff-only origin main
git tag -a v1.0.0 -m "Scribe 1.0.0"
git push origin v1.0.0
```

Watch **Actions > Release**, then inspect the draft release, review its notes, test the installer on Windows, and publish when ready. `SHA256SUMS.txt` verifies file integrity; it is not a Windows signing identity. The workflow stops if a release already exists or the tag moved during the build, rather than replacing assets. Review incomplete drafts manually before retrying failed uploads.

### Test reports and security

CI retains installer artifacts, JUnit reports and coverage reports for 14 days. Report upload runs even if a later test/build check fails. Add feature tests under `tests/**/*.test.ts` or `.test.tsx`; use `npm run test:watch` while developing and preserve coverage floors in `vitest.config.ts`. Test workers are capped at two to bound memory use on small runners. Generated reports stay ignored by Git.

Actions are pinned to verified release commits; Dependabot checks action updates monthly. PR jobs use read-only repository tokens, never `pull_request_target`, and do not persist Git checkout credentials. The job with release write permission downloads only this run's installer and does not check out or execute app code. Rust artifacts are not shared through PR-controlled caches.

The CI suite does not replace hosted authorization/OAuth/MFA tests, multi-device integration tests, native UI checks, or installer smoke testing.

```powershell
npm run version:check
npm run check
npm run check:native
npm run installer:build -- --ci -- --locked
```

## App version

`package.json` is the source of the app version. Tauri reads it directly, and the About page displays the same version.

To change the version without creating a Git commit or tag:

```powershell
npm version 0.1.0 --no-git-tag-version
```

The version lifecycle script updates `src-tauri/Cargo.toml` and the app entry in `src-tauri/Cargo.lock`. If you edit `package.json` manually, run `npm run sync:version`. Synchronization also runs before `npm run dev`, `npm run build`, and `npm run tauri`.

## Features

### Notes
- Create and edit notes.
- Organize notes into folders.
- Pin important notes for quick access.
- Move notes to Trash and restore them when needed.
- Permanently delete notes.
- View note previews and metadata.
- Markdown-supported note content.
- Automatic persistence and a responsive editing experience.

### Organization
- All Notes — View your active notes.
- Drafts — Find notes classified as drafts.
- Pinned Notes — Access pinned notes quickly.
- Trash — Manage deleted notes.
- Unfiled — Find notes that do not belong to a folder.
- Custom folders with names, icons, colors, and ordering.

### Desktop experience
- Dark-themed interface with a teal accent.
- Three-pane layout with navigation, note list, and editor.
- Search notes.
- Keyboard shortcuts for common actions.
- Windows-native desktop integration through Tauri.

### Quick capture

Press **Ctrl + Shift + Space** from any app to open the capture window. Scribe must be running; it can be minimized or in the system tray. Customize this global shortcut in **Settings → Keyboard shortcuts**; the binding is saved on this device.

Add an optional title and your note, choose a folder or reminder if needed, then press **Ctrl + Enter** or **Save note**. The note and its reminder are saved on this device before entering the existing cloud sync queues. **Esc** or the close button keeps your unfinished capture, folder and reminder locally for the next time you open it. Drafts are kept separately for each account. Quick capture requires a signed-in account and does not bypass two-step verification.

Use **Tab / Shift + Tab** to navigate, and arrow keys to choose a folder. Smart paste preserves copied links; paste a URL over selected text to make a Markdown link. **Ctrl + Shift + V** pastes plain text. Capture uses your notification and sound preferences: in-app feedback when returning to a focused Scribe window, or a desktop notification when capturing from another app.

Capture reminders use a compact date/time picker and the default reminder lead time from settings. Links appear in place as local preview cards in reading mode and compact note-card previews; capture also shows pasted links. No background requests are made for website metadata or images.

**Settings → Windows** groups launch at startup, close to system tray, and Quick Capture. Quick Capture is on by default; disabling it releases the global shortcut and keeps unfinished captures locally. This preference is saved on this device.

### Cloud and account support
- Supabase authentication.
- Cloud-backed notes and folder storage.
- User-specific data access enforced through Row Level Security (RLS).
- Optimistic UI updates with error handling and rollback.

Feature availability may vary as development progresses. Check the current application for the latest supported functionality.

## Technology Stack

| Technology | Purpose |
|---|---|
| React | User interface |
| Vite | Development server and build tooling |
| Tauri | Native desktop application |
| TypeScript | Application logic, depending on the module |
| Supabase Auth | Authentication |
| Supabase PostgreSQL | Cloud data storage |
| SQL | Schema, constraints, policies, and database functions |
| ESLint | Code quality and linting |

## Prerequisites

Install the following before developing Scribe on Windows:

- [Node.js](https://nodejs.org/) — use a version compatible with the project's dependencies.
- npm — included with Node.js.
- [Rust](https://www.rust-lang.org/tools/install) — required for Tauri's Rust backend.
- Microsoft C++ Build Tools and the Windows SDK.
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) — generally already present on modern Windows installations.
- A Supabase project for cloud-backed functionality.

See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform-specific setup instructions.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/arunabhajana/scribe-windows
cd scribe-windows
```

Replace the placeholders with the actual repository URL and directory.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root using the variable names expected by the existing Supabase client.

For example:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Use the exact variable names expected by your implementation. If your project uses a newer Supabase publishable key, configure that key rather than exposing any privileged credentials.

**Security rules:**
- Never commit `.env` files containing credentials.
- Never include a Supabase service-role key in the desktop client.
- Keep database access protected by RLS policies.
- Provide an appropriate `.env.example` file without real secrets.

### 4. Configure the Supabase database

Scribe uses a hosted Supabase project. A local PostgreSQL instance or local Supabase server is not required.

The initial database migration is maintained in the shared backend repository:

```text
scribe-backend/
└── supabase/
    └── migrations/
        └── 20261009000000_initial_schema.sql
```

To configure a new environment:

1. Open the Supabase Dashboard.
2. Select the project's SQL Editor.
3. Review and apply the initial migration if it has not already been applied.
4. Verify the `profiles`, `folders`, `notes`, and `user_settings` tables.
5. Verify RLS policies, foreign keys, indexes, and triggers.
6. Test database access using an authenticated user.

Do not apply the initial migration repeatedly to an existing database without checking its current schema and migration history.

### 5. Run the application

Start the frontend development server:

```bash
npm run dev
```

To run the desktop application through Tauri, use the project's configured Tauri script. In a standard Tauri setup, this is commonly:

```bash
npm run tauri dev
```

Check `package.json` if the project uses a different script name.

### 6. Build the application

Build the frontend:

```bash
npm run build
```

Build the Windows desktop application using the configured Tauri command, commonly:

```bash
npm run tauri build
```

Generated installers and bundles depend on the Tauri configuration.

## Database Overview

Scribe uses Supabase as its cloud database.

### `notes`

Stores the user's notes, including:

- `id` — UUID primary key.
- `user_id` — owner of the note.
- `folder_id` — associated folder, nullable.
- `title` — note title.
- `content` — note body.
- `is_pinned` — whether the note is pinned.
- `created_at` — creation timestamp.
- `updated_at` — last-update timestamp.
- `deleted_at` — soft-deletion timestamp, nullable.

The current implementation uses text-based note content. A migration to structured JSONB content may be introduced when the rich-text editor is ready.

### `folders`

Stores user-created folders and their presentation and ordering metadata, including ownership, name, icon, color, sort order, and timestamps.

Deleting a folder should detach its notes rather than delete them.

### `profiles`

Stores application-level profile information associated with the authenticated Supabase user.

### `user_settings`

Reserved for account-level settings that should synchronize across clients, such as theme, accent color, and font family.

The existence of a table does not necessarily mean every corresponding UI setting is already connected to it.

### System views

All Notes, Drafts, Pinned Notes, Trash, and Unfiled are logical views rather than rows in the `folders` table.

- Unfiled notes have no folder assigned.
- Trashed notes use `deleted_at`.
- Restoring a note clears `deleted_at`.
- Draft classification is derived from note content rather than requiring a dedicated database column.

## Security

Scribe uses Supabase authentication and database authorization.

- RLS policies restrict access to user-owned records.
- The authenticated user identity is used to associate records with their owner.
- Client applications use publishable credentials.
- Privileged database credentials must never be shipped in the desktop application.
- Schema changes should be maintained as versioned SQL migrations.

Always verify RLS policies and ownership constraints before deploying schema changes.

## Development and Quality Checks

Run the following checks before submitting changes:

```bash
npm run build
npx eslint src
```

Use the repository's configured test commands if additional automated tests are available.

When modifying database functionality, test note creation, editing, pinning, folder assignment, Trash, restoration, and permanent deletion.

## Project Structure

The exact structure may evolve, but a typical layout is:

```text
scribe-windows/
├── src/                  # React application
├── src-tauri/            # Tauri and Rust code
├── public/               # Static assets
├── package.json
├── vite.config.*
├── .env.example
├── .gitignore
└── README.md
```

Refer to the actual repository for the authoritative file layout.

## Roadmap

Potential improvements and planned features include:

- Note reminders.
- Attachments and image storage.
- System tray behavior and startup integration.
- Spellcheck and autocorrection.
- Automated update delivery.
- Improved cross-device synchronization with Android and the Chrome Extension.

These items are planned or under consideration and should not be interpreted as already released.

## Contributing

Contributions and improvements are welcome.

1. Create a feature branch.
2. Make focused changes.
3. Run the available build and lint checks.
4. Test the affected functionality.
5. Submit a pull request with a clear explanation of the change.

For database changes, include a versioned migration and consider compatibility with other Scribe clients that may update independently.

**Scribe** — Your notes, organized.
