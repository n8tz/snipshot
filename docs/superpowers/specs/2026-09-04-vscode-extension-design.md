# Snipshot for VS Code — design

Date: 2026-09-04. Status: approved for implementation (autonomous session; the
assumptions below are the decisions taken in place of clarifying questions).

## Goal

A VS Code extension that does what the IntelliJ plugin does, built and released
by the same pipeline: a `.vsix` attached to every GitHub Release next to
`snipshot-intellij-plugin.zip`, versioned from the root `package.json`.

"The same" means: the same right-click menu, the same actions and semantics
(Snipshot this red/green, Selection / Clipboard / SVG / Options, Mark red /
green / folded, Clear marks), the same settings (binary, destination, format,
theme, context, max width, max rows, open after save), binary download and
check, the same CLI command lines, and the same fallbacks (WSL clipboard
bridge, keep-as-file when the clipboard is out of reach).

## Feasibility: what VS Code cannot do the IntelliJ way

1. **No image clipboard API.** `vscode.env.clipboard` is text-only. The image
   therefore goes on the clipboard through a platform tool spawned by the
   extension, exactly like the plugin's WSL bridge already does: PowerShell on
   Windows and under WSL, `osascript` on macOS, `wl-copy` / `xclip` on Linux.
   Every other remote (SSH, containers, Codespaces) has no reachable clipboard:
   the shot is kept as a file, with the same notification as the plugin's WSL
   fallback.
2. **No form dialogs.** "Snipshot…" is a webview panel holding the same form
   (lines, red, green, fold, theme, format, context, max width, max rows,
   output) with a Snipshot button.
3. **No buttons in the settings UI.** "Download binary" and "Check" are
   commands (`Snipshot: Download Binary`, `Snipshot: Check Binary`), offered
   from the settings description and from the "snipshot not found" error.
4. **`Alt+Shift+F` is Format Document** in VS Code, so *Mark Selection Folded*
   defaults to `Alt+Shift+X`; the other four shortcuts are the plugin's.

Everything else maps one-to-one.

## Layout

```
extra/vscode/snipshot-vscode/
├── package.json          extension manifest: commands, submenu, keybindings, settings
├── package-lock.json
├── tsconfig.json         CommonJS, ES2022, strict; src + test → out/
├── .vscodeignore, .gitignore, LICENSE, README.md (Marketplace page), DEVELOPMENT.md
├── src/
│   ├── extension.ts      activate(): registers commands, marks, settings watchers
│   ├── ranges.ts         LineRange + pure editor-geometry helpers (no vscode import)
│   ├── request.ts        SnipshotRequest → CLI args, default output name (pure)
│   ├── marksModel.ts     mark store + shift-on-edit arithmetic (pure)
│   ├── clipboardStrategy.ts  which clipboard tool for this host (pure)
│   ├── platform.ts       release asset for this platform, PATH lookup (pure)
│   ├── settings.ts       typed access to the snipshot.* configuration
│   ├── context.ts        editor → ranges / highlight spec / request (uses vscode)
│   ├── marks.ts          decorations for the marks, document-change tracking
│   ├── runner.ts         spawns the CLI off the UI thread, notifications
│   ├── output.ts         clipboard / save dialog / folder delivery
│   ├── clipboard.ts      the platform copy commands, WSL bridge, "unavailable" memory
│   ├── downloader.ts     fetch + unpack the standalone binary, --version probe
│   └── optionsPanel.ts   the "Snipshot…" webview form
└── test/                 node:test suites for the pure modules
```

The pure modules import nothing from `vscode`, so they run under plain Node in
`npm test` (`node --test out/test`). The others are exercised by compiling
against `@types/vscode` and by packaging.

## Behaviour (mirrors the plugin)

- **Capture ranges**: one range per non-empty selection (multi-cursor gives
  several, the CLI folds the gaps), sorted; none → the visible range. A
  selection ending at column 0 stops on the previous line.
- **Snipshot this (red/green)**: lines = visible range widened to include the
  selection; the selection becomes a highlight spec: `L:c1-c2` when it sits
  inside a single line and does not cover it, else `L` / `L1-L2`. Columns are
  1-based inclusive on the tab-expanded line (tab = 4 spaces, as the CLI does).
- **Marks**: per file, session-only, tinted with whole-line decorations
  (light/dark variants of the plugin's colours). Line ranges follow document
  edits (line-delta shift). Cleared by the command or when the document closes.
- **Request**: `<file> --lines … [--highlight-red …] [--highlight-green …]
  [--fold …] --theme … --context n (--max-width n | --no-max-width)
  (--max-lines n | --no-max-lines) [--svg] [--root <workspace>] --output <path>`.
- **Destination**: clipboard (PNG; SVG falls back to asking), ask (save dialog
  opening on the last folder, remembered in globalState), `.snipshot/` in the
  workspace, workspace root, custom directory. Default name
  `<name>_L<ranges joined by +>.<ext>`.
- **Runner**: `execFile`, 60 s timeout, cwd = workspace folder, progress
  notification; non-zero exit → error notification with the CLI's message.
  Missing binary → error with *Download binary* / *Open settings*.
- **Saved** → info notification with *Open* / *Show in files*; `openAfterSave`
  opens it.
- **Clipboard**: temp PNG → platform copy → success info; failure → copy into
  `.snipshot/` + warning with Open / Show in files (the plugin's behaviour).
  Under WSL the PowerShell failure is remembered for the session.
- **Binary resolution**: `snipshot.executablePath`, else the downloaded binary
  in `globalStorage`, else `snipshot(.cmd|.exe|.bat)` on PATH.
- **Download**: `https://github.com/9pings/snipshot/releases/latest/download/
  <asset>` (follows redirects), unpacked with `tar` (bsdtar reads zip on
  Windows; PowerShell `Expand-Archive` as fallback), `chmod 755`.
- **Theme auto**: follows `window.activeColorTheme.kind`.

## Build and release

- `npm run build:vscode` (root) → `scripts/build-vscode.mjs`: syncs the
  extension version to the root version, `npm ci`, compile, test, `vsce
  package` → `standalone/vscode/snipshot-vscode-extension.vsix`.
- CI (`ci.yml`): a `vscode` job runs the same script on every push / PR.
- Release (`release.yml`): the `.vsix` is built and attached to the release;
  publishing to the Marketplace / Open VSX runs only when `VSCE_PAT` /
  `OVSX_PAT` secrets exist.
- Users install from the release asset with *Extensions: Install from VSIX…*.

## Out of scope

Bundling the CLI in the extension (147 MB per platform); a settings webview;
Marketplace icon and gallery banner.
