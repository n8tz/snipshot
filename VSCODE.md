<h1 align="center">Snipshot for VS Code</h1>

<p align="center">
  <strong>Right-click a selection, get a syntax-highlighted code screenshot.</strong><br>
  On the clipboard, or as a PNG or SVG file — with the file path in the header,
  red/green annotations and folds.
</p>

---

The extension is a thin wrapper around the [snipshot](README.md) CLI, so the images
it produces are the same ones your docs, your CI and your agents already generate.
It does what the [IntelliJ plugin](PLUGIN.md) does, with the same actions, settings
and fallbacks.

What editor screenshot extensions generally don't do, and this one does:

- **the file path in the image header**, relative to the workspace root;
- **red / green annotations** — point at a line, or mark several regions and shoot once;
- **folded regions** — collapse the noise into a `••• N lines folded •••` row;
- **several selections in one image** — multi-cursor ranges, gaps folded automatically.

## Install

Grab **`snipshot-vscode-extension.vsix`** from the
[releases](https://github.com/9pings/snipshot/releases) — every release builds one —
then, in the Extensions view, open the **…** menu and pick **Install from VSIX…**.
From a terminal:

```bash
code --install-extension snipshot-vscode-extension.vsix
```

It installs on VS Code 1.85 (November 2023) and every newer build, and on the
editors built from it (VSCodium, Cursor and the rest).

To build it yourself, see the
[extension development notes](extra/vscode/snipshot-vscode/DEVELOPMENT.md).

### The snipshot binary

The CLI does the rendering, but you do not have to install it by hand: run
**Snipshot: Download Binary** from the Command Palette (`Ctrl+Shift+P`) and it
fetches the standalone build for your platform and wires it up.

If you would rather manage it yourself, `npm install -g snipshot` or a binary of
your own both work. The extension resolves, in order: the `snipshot.executablePath`
setting, then a binary it downloaded, then the first `snipshot` on your `PATH`.
**Snipshot: Check Binary** shows which one it picked and what version answered.

## Usage

Everything lives under **right-click → Snipshot** in the editor, and in the Command
Palette under the `Snipshot:` prefix.

| Action | Default shortcut | What it does |
|---|---|---|
| Snipshot this (red) | — | Shoots the **visible window** and outlines the selection in red |
| Snipshot this (green) | — | Same, in green |
| Snipshot Selection | `Alt+Shift+S` | Shoots the selected lines (or the visible area) |
| Copy Snipshot to Clipboard | `Alt+Shift+C` | Same, forced onto the clipboard |
| Snipshot Selection as SVG | — | Same, forced to SVG |
| Snipshot… | — | Options form, pre-filled from the selection and marks |
| Mark Selection Red | `Alt+Shift+R` | Annotate these lines in red on the next shot |
| Mark Selection Green | `Alt+Shift+G` | Annotate these lines in green |
| Mark Selection Folded | `Alt+Shift+X` | Collapse these lines on the next shot |
| Clear Snipshot Marks | — | Drop every mark on this file |
| Download Binary | — | Fetch the standalone CLI for this machine |
| Check Binary | — | Show which binary is used, and its version |

The shortcuts are the IntelliJ plugin's, except *Folded*: `Alt+Shift+F` is Format
Document in VS Code, so it is `Alt+Shift+X` here. Rebind any of them under
**File | Preferences | Keyboard Shortcuts** if they clash with yours.

The CLI reads the file from disk, so a file with unsaved changes is saved before
the shot.

### Point at something in its context

**Snipshot this (red)** is the one-gesture case: select what you want to talk about,
right-click, and the image is the *window around it* with your selection outlined —
not a screenshot of the selection alone. A selection sitting inside a single line is
outlined character by character (`--highlight-red 47:12-38`); a wider one is
highlighted line by line. If the selection is scrolled partly out of view, the shot
widens to keep it in frame.

### Marking several regions

For anything richer than one annotation, mark first and shoot once:

```
select line 47        → Alt+Shift+R    (turns red in the editor)
select lines 52-55    → Alt+Shift+G    (turns green)
select lines 40-60    → Alt+Shift+S
```

which runs `snipshot <file> --lines 40-60 --highlight-red 47 --highlight-green 52-55`.

Marks are tinted in the editor, so what you see is what the image will carry. They
follow your edits, live for the session, survive across shots, and go away with
**Clear Snipshot Marks** or when the file is closed.

### What gets captured

- **A selection** → those lines.
- **Several selections** (multi-cursor, `Alt`+click or `Ctrl+Alt+↓`) → one range
  each; snipshot folds the gaps between them automatically.
- **No selection at all** → whatever is currently scrolled into view.

Three lines of context are added around each range, as in the CLI.

## Settings

**File | Preferences | Settings**, then search for `snipshot`.

### snipshot binary

`snipshot.executablePath` — the path to use. Leave it empty to use a downloaded
binary or your `PATH`. The description links to **Download binary** and **Check**.

### Output

`snipshot.destination`:

| Value | Behaviour |
|---|---|
| `clipboard` | *Default.* PNG on the clipboard, nothing written to disk |
| `ask` | Save dialog, opening on the folder you used last |
| `projectSnipshot` | `.snipshot/` in the workspace, created on demand |
| `projectRoot` | Straight into the workspace folder |
| `custom` | A fixed folder: `snipshot.customDirectory` |

`snipshot.format` picks PNG or SVG for the plain actions; *Snipshot Selection as
SVG* always wins over it. SVG cannot live on the clipboard, so an SVG shot under the
clipboard default falls back to asking for a path.

Saved images are not opened in the editor — the notification offers it, and
`snipshot.openAfterSave` makes it automatic.

### Rendering

`snipshot.theme` (`auto` follows the VS Code theme), `snipshot.contextLines`,
`snipshot.maxWidth` and `snipshot.maxLines`. These mirror the CLI's `--theme`,
`--context`, `--max-width` and `--max-lines`; `0` lifts a limit. They can be
overridden per shot in the **Snipshot…** form.

## Notes

### Clipboard

VS Code's clipboard API only carries text, so the extension hands the PNG to the
platform's own tool:

| Host | Tool |
|---|---|
| Windows | PowerShell (`System.Windows.Forms.Clipboard`), always present |
| macOS | `osascript`, always present |
| Linux | `wl-copy` (Wayland, package `wl-clipboard`) or `xclip` (X11) — install one |
| WSL | PowerShell on the Windows side, through WSL interop (see below) |

When the copy cannot succeed, the shot is not lost: it is written to `.snipshot/`
in the workspace and the notification says so, with *Open* and *Show in files*.

### Running under WSL

Whether VS Code runs with the **WSL** remote (the usual setup) or natively inside
WSLg, the extension runs on the Linux side, and a Linux clipboard never reaches
Word, Outlook or any other Windows application — WSLg bridges only text. The
extension detects WSL and hands the file to the Windows clipboard through
PowerShell instead, which does work. That needs **WSL interop** enabled (it is by
default; `[interop] enabled = true` in `/etc/wsl.conf`).

**If interop is off**, the copy cannot succeed: the shot is kept in `.snipshot/` as
above, and PowerShell is not retried for the rest of the session, since interop
does not come back mid-run. In that situation, point the destination at a folder
Windows can see and the round trip disappears — anything under `/mnt/c/…` is a
normal Windows path:

```json
"snipshot.destination": "custom",
"snipshot.customDirectory": "/mnt/c/Users/<you>/Pictures/snipshots"
```

Word then inserts the file directly, with no clipboard involved.

### Other remotes

With **Remote - SSH**, dev containers or Codespaces, the extension runs on the
remote host, whose clipboard is not the one you paste from. Clipboard shots fall
back to the `.snipshot/` file on the remote; pick a file destination there.

**Errors** come straight from the CLI. The one you will meet is the page-fit guard —
*"would be 91 lines, over the 70-line limit"*. Narrow the selection, fold a section,
or set `snipshot.maxLines` to 0 to lift the limit.
