<h1 align="center">Snipshot for IntelliJ</h1>

<p align="center">
  <strong>Right-click a selection, get a syntax-highlighted code screenshot.</strong><br>
  On the clipboard, or as a PNG or SVG file — with the file path in the header,
  red/green annotations and folds.
</p>

---

The plugin is a thin wrapper around the [snipshot](README.md) CLI, so the images it
produces are the same ones your docs, your CI and your agents already generate.

What IDE screenshot plugins generally don't do, and this one does:

- **the file path in the image header**, relative to the project root;
- **red / green annotations** — point at a line, or mark several regions and shoot once;
- **folded regions** — collapse the noise into a `••• N lines folded •••` row;
- **several selections in one image** — multi-caret ranges, gaps folded automatically.

## Install

Grab **`snipshot-intellij-plugin.zip`** from the
[releases](https://github.com/9pings/snipshot/releases) — every release builds one —
then **Settings | Plugins | ⚙ | Install Plugin from Disk…**, pick the zip, restart.

It installs on IntelliJ 2024.1 and every newer build, in any JetBrains IDE — IDEA,
WebStorm, PyCharm, Rider and the rest.

To build it yourself, see the
[plugin development notes](extra/intelij/snipshot-plugin/README.md).

### The snipshot binary

The CLI does the rendering, but you do not have to install it by hand:
**Settings | Tools | Snipshot** has a **Download binary** button that fetches the
standalone build for your platform and wires it up.

If you would rather manage it yourself, `npm install -g snipshot` or a binary of
your own both work. The plugin resolves, in order: the configured path, then a
binary it downloaded, then the first `snipshot` on your `PATH`. The **Check** button
shows which one it picked and what version answered.

## Usage

Everything lives under **right-click → Snipshot** in the editor.

| Action | Default shortcut | What it does |
|---|---|---|
| Snipshot this (red) | — | Shoots the **visible window** and outlines the selection in red |
| Snipshot this (green) | — | Same, in green |
| Snipshot Selection | `Alt+Shift+S` | Shoots the selected lines (or the visible area) |
| Copy Snipshot to Clipboard | `Alt+Shift+C` | Same, forced onto the clipboard |
| Snipshot Selection as SVG | — | Same, forced to SVG |
| Snipshot… | — | Options dialog, pre-filled from the selection and marks |
| Mark Selection Red | `Alt+Shift+R` | Annotate these lines in red on the next shot |
| Mark Selection Green | `Alt+Shift+G` | Annotate these lines in green |
| Mark Selection Folded | `Alt+Shift+F` | Collapse these lines on the next shot |
| Clear Snipshot Marks | — | Drop every mark on this file |

The shortcuts are only suggestions — rebind them under **Settings | Keymap** if they
clash with yours.

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
live for the session, survive across shots, and go away with **Clear Snipshot Marks**.

### What gets captured

- **A selection** → those lines.
- **Several selections** (multi-caret, `Alt`+click) → one range each; snipshot folds
  the gaps between them automatically.
- **No selection at all** → whatever is currently scrolled into view.

Three lines of context are added around each range, as in the CLI.

## Settings

**Settings | Tools | Snipshot**, in three sections.

### snipshot binary

The path to use, a **Download binary** button, and **Check** to see what actually
answered. Leave the path empty to use a downloaded binary or your `PATH`.

### Output

| Destination | Behaviour |
|---|---|
| Clipboard (PNG) | *Default.* Nothing is written to disk; paste it wherever |
| Ask every time | Save dialog, opening on the folder you used last |
| `.snipshot` directory in the project | Created on demand, next to your code |
| Project root | Straight into the project directory |
| Custom directory | A fixed folder of your choosing |

**Format** picks PNG or SVG for the plain actions; *Snipshot Selection as SVG* always
wins over it. SVG cannot live on the clipboard, so an SVG shot under the clipboard
default falls back to asking for a path.

Saved images are not opened in the IDE — the notification offers it, and a setting
makes it automatic.

### Rendering

Theme (`auto` follows the IDE), context lines, max width and the page-fit row limit.
These mirror the CLI's `--theme`, `--context`, `--max-width` and `--max-lines`, and
can be overridden per shot in the **Snipshot…** dialog.

## Notes

**Clipboard.** The image is offered both as an AWT image and as raw PNG bytes,
because applications differ on which one they ask for.

**Running the IDE inside WSL?** WSLg bridges only *text* between the Linux and
Windows clipboards, so an image copied the normal way can be pasted inside the IDE
but never reaches Word, Outlook or any other Windows application. The plugin detects
WSL and additionally hands the file to the Windows clipboard through PowerShell.
That needs WSL interop enabled (the default); if it is not, the copy says so rather
than looking like it worked. Failing that, set **Destination** to a folder.

**Errors** come straight from the CLI. The one you will meet is the page-fit guard —
*"would be 91 lines, over the 70-line limit"*. Narrow the selection, fold a section,
or set **Max rows** to 0 to lift the limit.
