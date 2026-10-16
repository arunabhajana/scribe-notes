<p align="center">
  <img src="public/scribe-logo-v2.png" alt="Scribe Notes icon" width="112" height="112" />
</p>
<h1 align="center">Scribe Notes</h1>
<p align="center"><strong>A little space. For big thoughts.</strong></p>
<p align="center">A local-first Windows notes app with offline profiles, Markdown, reminders, and optional cloud sync.</p>
<p align="center">
  <a href="#features">Features</a> ·
  <a href="#installation">Install</a> ·
  <a href="#getting-started">Get started</a> ·
  <a href="#for-developers">Developers</a> ·
  <a href="LICENSE">MIT License</a>
</p>

Scribe Notes is a small, independent open-source project. Use an offline profile to keep your workspace on your device, or sign in and choose whether to enable cloud sync. Signing in does not automatically upload or transfer an offline profile's notes.

**Status:** in development, with Windows x64 support. Other architectures, mobile apps and browser extensions are planned separately. This project is not affiliated with other products named Scribe.

## For users

### Features

| Feature | What you can do |
| --- | --- |
| Notes and Markdown | Write headings, lists, checkboxes, links, quotes, code and inline formatting. Switch between editing and reading modes. |
| Organization | Use folders, colors and icons; pin notes; search and sort; manage Drafts, Trash and Unfiled notes. |
| Offline profile | Start with a display name, without an email or password. The profile and notes stay on this device. |
| Optional cloud sync | Sign in with email, Google or GitHub, then explicitly enable sync when you want it. |
| Quick Capture | Open a compact capture window from another app while Scribe is running. Add notes, folders and reminders. |
| Reminders | Schedule note reminders and choose notification and lead-time preferences. |
| Data portability | Export a Scribe backup or Markdown ZIP; review and import files as new copies into an offline or online workspace. |
| Personalization | Adjust appearance, writing preferences and shortcuts. Workspace preferences are stored separately. |
| Account controls | Manage account security/devices, clear selected data, or delete an account/profile. Online features require an account. |

### Installation

1. Open the [Releases page](https://github.com/arunabhajana/scribe-windows/releases).
2. When a published release is available, download its **Windows x64 `-setup.exe`** installer. x64 is the standard Intel/AMD desktop build, not an ARM64 installer.
3. Run setup, choose an installation location and shortcuts, then launch Scribe.
4. Create an offline profile or sign in to an online account.

If no release is published yet, developers can [build from source](#run-and-build).

The installer checks for WebView2 and handles its prerequisite flow. Setup does not enable startup launch or cloud sync. The current installer is unsigned; Windows code signing is not configured yet.

### Getting started

**Start offline:** choose the offline-profile option on the entry screen and enter a display name. No server account is created. An offline profile has no password protection or cloud recovery; keep an exported copy of important notes.

**Use an online account:** sign up or sign in. Email signup requires address confirmation, and new online accounts accept the Terms of Use. Google/GitHub and other account features depend on the configured service. Cloud sync starts disabled, including for signed-in users.

**Enable sync:** open **Settings › General › Cloud sync**, read the explanation, and confirm. Scribe uploads that online workspace's notes, formatting, folders, pins, Drafts, Trash and reminders, and downloads the account's cloud changes. This preference applies to the account on this device.

**Keep workspaces separate:** the offline profile and each online account have separate local workspaces. Signing in does not convert or merge the offline profile. To move notes, export from the original workspace, switch to the destination and import the file there.

### Quick Capture and shortcuts

Scribe must be running for Quick Capture to work; it may be minimized or in the system tray. Capture works in an active offline or online workspace. Cloud uploads still depend on sync being enabled.

| Default Windows shortcut | Action |
| --- | --- |
| `Ctrl + Shift + Space` | Open Quick Capture globally |
| `Ctrl + N` | Start a new note |
| `Ctrl + K` | Focus note search |
| `Ctrl + E` | Switch editing/reading mode |
| `Ctrl + 1` / `2` / `3` / `4` | All Notes / Drafts / Pinned Notes / Trash |
| `Ctrl + Shift + B` | Toggle the sidebar |
| `Ctrl + Shift + P` | Toggle the selected note's pin |
| `Ctrl + ,` | Open settings |
| `Ctrl + Enter` in Quick Capture | Save the capture |
| `Esc` in Quick Capture | Close and keep the unfinished capture locally |

Customize bindings in **Settings › Keyboard shortcuts**. Windows settings include startup launch, close-to-tray behavior and Quick Capture availability. Another app claiming the global shortcut can prevent it from registering.

### Export, import and backups

Open **Settings › General** to export or import. Choose which notes to include, with optional Drafts, Trash, empty folders and reminders where the format supports them.

| Format | Best for | What it preserves |
| --- | --- | --- |
| **Scribe backup (`.scribe`)** | Restoring or transferring content in Scribe | Notes, folders, formatting, dates, pins, Drafts, Trash and selected reminder schedules. It does not export account identity, sign-in credentials or workspace preferences. |
| **Markdown ZIP (`.zip`)** | Readable files for other apps | Markdown notes grouped by folder. Scribe-specific status, pins, dates and reminders are not restored from this format. |

Import accepts a Scribe backup, a Markdown ZIP, or selected `.md`/`.markdown` files. Imports allocate fresh IDs and preserve existing notes. Repeating an imported selection requires explicit permission to add more copies. Future reminders are restored only when selected. Transfers are limited to 50 MB per selection and the format's record limits.

Exports contain your note content; store them somewhere you trust. **Scribe does not maintain project backups.** Cloud sync is not a backup service. Keep your own exports separately from app storage.

### Storage, privacy and deletion

- **Local storage:** Scribe imposes no local content quota. Capacity depends on your device and WebView storage. Local content is not protected by an app-level encryption/password boundary.
- **Cloud storage:** each account has **2 MB**, shared by notes, folders and reminder metadata. Drafts and Trash count too. Formatting can make cloud content larger than the local estimate, so the displayed figures are not directly comparable.
- **With sync off:** new workspace changes stay on this device. Uploaded cloud data remains until deleted. Signed-in session/security and cloud-usage checks can still use the internet; disabling sync does not disable all network requests.
- **Cloud content:** notes are not end-to-end encrypted. Read the Privacy Policy linked in the app before enabling sync.
- **Delete content:** open **Settings › Account › Delete Data**. Offline profiles clear local content; online accounts can select local data, cloud data, or both while retaining the account. Review the displayed scope. Other saved workspaces are kept.
- **Delete a profile/account:** Account settings also provide offline-profile deletion or online-account deletion. Online-account deletion removes the account, associated cloud data and that workspace's saved data on this device. It does not remotely wipe other devices' local copies or exported files. Online destructive actions require security verification.

Export anything you want to keep before permanent deletion. Turning sync off, signing out and moving notes to Trash are not account deletion or permanent content erasure. Enabling sync again after deleting cloud content can upload retained local notes.

### Help and feedback

Use [GitHub Issues](https://github.com/arunabhajana/scribe-windows/issues) for bugs and feature requests. Include the app version, Windows version, reproduction steps and a screenshot if useful. Remove private notes, email addresses, tokens and authenticator codes from shared screenshots/logs.

If sync fails, read the message and check cloud storage. Quota errors keep changes locally; shorten content or permanently remove unwanted cloud content, including Trash, then retry. For capture problems, check that Scribe is running, Quick Capture is enabled and another app has not claimed its shortcut.

## For developers

### Stack

| Layer | Implementation |
| --- | --- |
| UI | React 19, TypeScript, Tailwind CSS 4, Lucide |
| Frontend tooling | Vite 8 and ESLint |
| Desktop | Tauri 2, Rust, Windows integrations and a custom NSIS installer |
| Local persistence | IndexedDB for content/queues; workspace-scoped localStorage preferences |
| Online services | Supabase Auth, PostgreSQL RPCs, Realtime sync wakeups |
| Testing | Vitest, Testing Library, jsdom, fake IndexedDB and security regression scripts |
| Continuous integration | GitHub Actions checks for pull requests |

### Prerequisites

- Git and **Node.js 24.14.1**, as recorded in [.node-version](.node-version), with npm.
- For Windows desktop work: Rust/MSVC, Microsoft C++ Build Tools with desktop C++ support, the Windows SDK, and WebView2. The project is checked with **Rust 1.95.0**.
- For online features: a correctly configured Supabase project. Unit tests use mocks and do not require a live project.

See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for native setup. A browser-only session cannot exercise native windows, global shortcuts, tray behavior or native save dialogs.

### Set up the repository

```powershell
git clone https://github.com/arunabhajana/scribe-windows.git
cd scribe-windows
npm ci
```

`npm ci` installs committed dependency versions. Use `npm install <package>` deliberately when adding/updating a dependency, and commit the resulting lockfile changes.

Create a root `.env` for cloud-enabled development/builds:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
# Optional: website base URL for Terms of Use and Privacy Policy links.
VITE_SCRIBE_WEBSITE_URL=http://localhost:4321
```

For a legacy public anon key, use `VITE_SUPABASE_ANON_KEY` **instead of** the publishable variable. Do not leave an empty publishable variable overriding it. These are public client values embedded by Vite, not privileged credentials. Never use a service-role/secret key. `.env` is ignored by Git.

The app can offer an offline profile without a configured cloud client. Production builds and the full gate intentionally require valid public Supabase configuration. For a different project, update the HTTPS/WSS origins in `src-tauri/tauri.conf.json`'s production/development CSP as well as `.env`; do not replace them with wildcard access.

The separate product/legal website is not built here. Without `VITE_SCRIBE_WEBSITE_URL`, development legal links fall back to `http://localhost:4321`. For your own deployment, use an HTTPS base URL with `/terms` and `/privacy` pages.

### Run and build

| Command | Result |
| --- | --- |
| `npm run dev` | Frontend server at `http://127.0.0.1:5173` |
| `npm run tauri -- dev` | Native desktop development app; Tauri starts the frontend server |
| `npm run build` | Typecheck and production frontend in `dist/` |
| `npm run preview` | Preview the built frontend in a browser |
| `npm run check:native` | Compile-check native code using `Cargo.lock` |
| `npm run installer:build -- --ci -- --locked` | Build the branded Windows x64 NSIS installer with locked Cargo dependencies |
| `npm run installer:artwork` | Regenerate installer bitmap artwork on Windows |

Installers are produced in `src-tauri/target/release/bundle/nsis/`. The installer script merges the base config with `src-tauri/tauri.installer.conf.json`; use it to check the distributed app rather than a generic default bundle command. See the [installer guide](src-tauri/installer/README.md) for artwork, shortcuts, updates and uninstallation.

**Development and installed data are separate:** development uses `com.tauri.dev`; the branded installer uses `app.scribenotes.desktop`. Export/import content to move between them. Keep the installed identifier stable across releases.

### How it works

1. **Workspace selection:** the offline profile uses its UUID; online workspaces use authenticated account IDs. Display names/emails are not storage keys. Local notes/folders are keyed by workspace plus entity ID, preventing collisions across accounts. The current UI maintains one saved offline profile alongside saved online-workspace data.
2. **Local writes:** edits persist to IndexedDB and durable queues. Local note bodies are Markdown; folder association, pins, explicit `isDraft`, soft-deletion dates and timestamps are separate fields. Preferences belong to the workspace rather than being shared globally.
3. **Optional sync:** online repositories send bounded RPC batches only with sync enabled. The outbox records mutation/revision IDs, base versions and the exact in-flight payload before requests. Retry receipts, cursors and server revisions support retries; divergent edits can become conflict copies. Incoming cloud application is held during editing.
4. **Cloud content:** Markdown converts to a validated structured rich-text document for JSONB storage and back on receipt. Draft status is explicit. All Notes, Drafts, Pinned, Trash and Unfiled are logical views, not custom folder rows.
5. **Native boundary:** Rust handles capture windows, system integration, notifications, export dialogs and deep links. Main/capture windows have separate explicit capabilities; sensitive commands check their window/account context.
6. **Transfer/deletion:** imports allocate fresh entity IDs and retain recovery/history records. Deletion markers and local generation checks prevent stale saves from recreating cleared data. Content, profile/account, local scope and cloud scope are separate concepts.

### Backend integration

The shared `scribe-backend` repository holds SQL migrations, verification queries and Edge Functions. It is maintained separately; this client's CI/CD does not deploy it.

Review/apply the **full applicable migration sequence**, not just the initial schema. Later migrations define Drafts, structured content, RPC sync, reminders, the 2 MB quota, account terms, device/session controls, MFA guards and deletion services. Coordinate migration changes with other clients sharing the project.

Configure Supabase email/OAuth providers and callback/redirect allowlists for the app's deep-link scheme, `com.scribe.notes`. Deploy/configure the deletion functions and their backend-only credentials using the backend's instructions. Never put those privileged values in the desktop client's `.env`.

Public keys do not replace authorization: maintain user-scoped RLS and RPC ownership/session checks. Internal protocol/private tables intentionally prohibit direct client access. Private implementation schemas must remain outside exposed API schemas. Verify hosted settings separately from local tests.

### Repository map

```text
.github/                  Automated checks and repository workflows
changelogs/               Versioned JSON release notes
assets/branding/          Branding images
public/                   Static assets, fonts and font licenses
scripts/                  Version/build guards, security checks, artwork
src/
  App.tsx                 Main app composition
  Surface.tsx             Main/capture surface selection
  components/             Auth, layout, editor, settings and dialogs
  features/
    auth/                 Accounts, offline profiles, terms and deletion
    capture/              Quick Capture surface and bridge
    notes/                Local store, sync and rich-text conversion
    reminders/            Reminder persistence/sync
    settings/             Workspace preferences, cloud consent/storage
    transfer/             Backup/Markdown export and import
    updates/              Update checks and bundled changelog history
  hooks/                  Auth, notes, reminders and session orchestration
  types/note.ts           Shared note/folder contracts
src-tauri/
  src/                    Rust commands and integrations
  capabilities/           Main/capture capability sets
  permissions/            Explicit app command permissions
  installer/              NSIS template, artwork and upstream notice
  tauri.conf.json         Base configuration and CSP
  tauri.installer.conf.json  Distribution branding/configuration
tests/                    Unit, component and persistence regressions
```

### Tests and quality gates

| Command | Checks |
| --- | --- |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Rerun tests during development |
| `npm run test:coverage` | Tests and enforced coverage thresholds |
| `npm run lint` | ESLint |
| `npm run typecheck` | App, configuration, tests and version-helper types |
| `npm run security:check` | Security regressions and current-tree privileged-credential pattern scan |
| `npm run security:config` | Production public-key, HTTPS and CSP checks |
| `npm run version:check` | Check committed versions without changing files |
| `npm run check` | Version/changelog checks → lint → types → coverage tests → security checks → production build |
| `npm run check:native` | Rust/Tauri compilation, not native UI testing or a Rust unit-test suite |

The full frontend gate stops at the first failure. `npm run build` alone compiles the frontend; it does not replace the gate.

Tests cover signup validation, safe Markdown, editor/list behavior, sorting, workspace isolation/preferences, cloud consent, storage feedback, sync retries/acknowledgements/conflicts, deletion guards, import/export, reminders and release validation. Storage tests exercise production persistence code against in-memory IndexedDB; no live Supabase project or real account is used.

**Reports:** `test-results/junit.xml`, `coverage/lcov.info` and `coverage/index.html`, all generated and ignored by Git. Coverage includes untested feature modules so gaps stay visible. Overall floors are 30% statements/lines, 20% branches and 25% functions, with higher floors for selected persistence, transfer, storage and version modules. These initial floors are not comprehensive app coverage.

**New tests:** add `tests/<feature>.test.ts` or `.test.tsx`; discovery/typechecking is automatic. Reuse `tests/fixtures.ts`. Include success, invalid input and recovery paths, with cross-workspace cases for storage changes. For module-cached stores, reset modules and import inside tests to bind to the fresh database. `tests/setup.ts` resets storage/IndexedDB, cleans up React, restores timers and rejects unexpected fetches. Use explicit mocks/fake timers; `.only` is forbidden and worker count is bounded.

These checks do not establish real OAuth/MFA behavior, hosted RLS correctness, multi-device sync, native WebView layout, notification delivery or installer/upgrade/uninstall behavior. Check those separately before release. The credential scan covers current tracked/new non-ignored text, not Git history or every possible secret type.

### Contributing

Create a focused feature or fix branch and open a pull request into `main`. Describe the change and how you checked it. Include regression tests for behavior changes.

Before opening a PR, run:

```powershell
npm run check
```

For Rust or desktop integration changes, also run:

```powershell
npm run check:native
```

Pull requests run automated frontend checks and a Windows installer build. Required checks must pass before merging. You can inspect the [CI workflow](.github/workflows/ci.yml) for the exact steps. Contributors do not need production signing keys or release permissions to develop and submit changes.

Check native interactions manually when changing windows, shortcuts, notifications or installer behavior. Backend schema changes belong in the separate backend repository and need coordination with other clients. Maintainers handle version bumps, signing and publishing.

### License

Application code is available under the [MIT License](LICENSE). Preserve license/copyright notices when redistributing it. Bundled fonts and the upstream installer template have their own notices in `public/fonts/` and `src-tauri/installer/LICENSE-Tauri`; the app's MIT license does not replace those notices.
