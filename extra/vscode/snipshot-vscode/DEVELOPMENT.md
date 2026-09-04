# Snipshot — VS Code extension (development)

Sources of the VS Code extension. **For what it does and how to use it, see
[VSCODE.md](../../../VSCODE.md)**; this file covers building and maintaining it.

## Build

From the repository root:

```bash
npm run build:vscode
```

The installable `.vsix` lands in `standalone/vscode/snipshot-vscode-extension.vsix`,
next to the standalone CLI binaries and the IntelliJ plugin zip, versioned from the
root `package.json` so a local build matches the release of the same version. This
is the command CI runs too; it compiles, runs the unit tests, then packages.

Needs **Node 22 or newer** (`@vscode/vsce` wants 20, the test runner's globs 21).
Nothing else: the extension has no runtime dependencies.

Working inside the folder:

```bash
cd extra/vscode/snipshot-vscode
npm install
npm test            # compile + unit tests (node --test)
npm run package     # a .vsix in this folder
```

To try it in a live editor, open this folder in VS Code and press **F5**: the
committed launch configuration starts an Extension Development Host with the
extension loaded.

## Tests

Two layers, both automatic:

```bash
npm test                # unit tests, plain Node, a second
npm run test:integration   # a real VS Code, ~a minute after the first download
```

**Unit tests** (`test/`, `node:test`) cover the pure modules: selection
geometry, the command line, the marks and how they follow edits, the clipboard
strategy, the platform facts, the options form, downloading and unpacking. One
of them activates the compiled extension against a stubbed `vscode` module and
cross-checks the manifest: every declared command is registered, every menu and
keybinding points at a declared command, and the settings defaults match the
code.

**Integration tests** (`integration/`, Mocha through `@vscode/test-cli`) download
a VS Code into `.vscode-test/`, open a throwaway copy of `integration/fixtures/`
as the workspace and run the suite *inside* the Extension Development Host, with
the full API. The CLI they drive is `integration/snipshot-shim.cjs`, which logs
its arguments and then runs the real `dist/index.js` from the repository root
(build it first: `npm run build` at the root). That is how they check, for every
action, the exact command line the extension sends, and that the PNG or SVG
really lands where the destination says. The clipboard shot is read back through
`xclip` where one exists; elsewhere the kept-as-file fallback is checked instead.

They need a display: `xvfb-run -a npm run test:integration` on a headless Linux
(CI does that, with `xclip` installed), WSLg or a desktop otherwise. What they
cannot reach is the inside of the options webview, which is why the form is a
pure module with its own unit tests.

## Toolchain

TypeScript 6 compiling to CommonJS (`module: node20`), `@types/vscode` pinned to
**exactly** the engine floor (`1.85.0`, for `engines.vscode: ^1.85.0`): vsce refuses
to package when the types are newer than the engine, so bump both together.
Unit tests use Node's built-in `node:test`; there is nothing to install for them.

## Layout

| File | Role |
|---|---|
| `src/ranges.ts` | Line ranges, selection → range / highlight-spec geometry (pure) |
| `src/request.ts` | The CLI invocation model and its command line (pure) |
| `src/marksModel.ts` | Per-file red/green/fold marks, and how they follow edits (pure) |
| `src/platform.ts` | Release asset per platform, PATH lookup, WSL detection (pure) |
| `src/clipboardStrategy.ts` | Which clipboard tool this host gets (pure) |
| `src/settings.ts` | The `snipshot.*` settings, theme resolution, last save folder |
| `src/context.ts` | Reads the editor into a request |
| `src/marks.ts` | The marks' editor tint and edit tracking |
| `src/process.ts` | Spawning with a timeout, npm `.cmd` shims on Windows |
| `src/runner.ts` | Resolves the binary, runs the CLI, notifications |
| `src/output.ts` | Delivers the result: clipboard, save dialog, or a folder |
| `src/clipboard.ts` | The platform copy commands and the WSL bridge |
| `src/downloader.ts` | Fetches the standalone binary from GitHub releases |
| `src/optionsPanel.ts` | The "Snipshot…" form (a webview) |
| `src/extension.ts` | The commands |
| `test/` | Unit tests of the pure modules |

The pure modules never import `vscode`, which is what lets them run under plain
Node. Everything the commands send is a plain `snipshot` command line, so anything
the extension can produce can be reproduced from a terminal.

## Compatibility

`engines.vscode` is `^1.85.0` (November 2023) with no upper bound. The extension
uses long-stable APIs only: commands, submenus, decorations, the save dialog,
webviews, `globalStorageUri`, `env.remoteName`, `activeColorTheme`.
