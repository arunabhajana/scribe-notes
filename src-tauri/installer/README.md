# Scribe Windows installer

Build from the repository root:

```powershell
npm run installer:build
```

The setup executable is written to `src-tauri/target/release/bundle/nsis/`.
The command combines `tauri.conf.json` with `tauri.installer.conf.json`.

## Experience

1. Branded welcome with offline-profile, optional-sync and WebView2 explanations.
2. Installation folder selection for the current Windows user.
3. Shortcut choices: Start menu checked; desktop unchecked. Existing shortcuts
   are retained when updating. No startup or cloud-sync setting is enabled.
4. Installation with progress/details and the standard WebView2 prerequisite flow.
5. Branded completion page with an optional Launch Scribe checkbox.

Tauri's maintenance/reinstall page still appears when applicable. Silent/passive
and update modes retain the upstream handling and do not display the custom
shortcut page. Unattended setup does not add a desktop shortcut.

The uninstaller keeps saved app data by default. Selecting its data-removal
checkbox requires a second explicit confirmation explaining that **every local
workspace**, preferences and saved sign-in session on that PC will be removed.
It does not delete cloud data or exported files. This deliberately differs from
the per-workspace deletion controls in the app.

## Identity and existing development data

The installer uses `app.scribenotes.desktop`; development retains its current
`com.tauri.dev` identifier. The installed application therefore starts with a
separate WebView data directory. It does not migrate or erase development data.
Export from the development workspace and import into the installed app if
needed. Keep the installed identifier stable across releases.

The displayed product name is Scribe and the publisher is Scribe contributors.
The default folder is `%LOCALAPPDATA%\Programs\Scribe Notes`. Uninstall metadata
is keyed by the bundle identifier to avoid another product named Scribe.
These metadata fields do not mean the installer is code signed. Signing and
SmartScreen reputation need their own release setup.

## Artwork and maintenance

`assets/sidebar.bmp` (164 x 314) and `assets/header.bmp` (150 x 57) are 24-bit images generated
from the existing logo. Regenerate with:

```powershell
npm run installer:artwork
```

The generator uses Windows System.Drawing and Segoe UI, without new dependencies.
The native NSIS controls remain in use for keyboard navigation and Windows DPI
support. Artwork and page surfaces use Scribe's dark/purple palette; operating
system buttons, focus indicators and dialogs can follow Windows styling.

`scribe.nsi` is based on the official **Tauri CLI 2.12.1** template:
https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.1/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi

Tauri is MIT OR Apache-2.0 licensed. The upstream MIT notice is included in
`LICENSE-Tauri`. When upgrading the CLI, compare its template with this one,
especially update/reinstall handling, WebView2, deep links, shortcut migration
and uninstallation. Custom sections are marked Scribe or describe shortcut
selection and the local-data confirmation.

No installer has been executed on the developer's machine as part of this change.
Before distribution, review installation, upgrade, cancel, shortcut choices,
launch, high-DPI rendering and uninstall behavior in a disposable Windows VM.
