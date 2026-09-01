# Snipshot — IntelliJ plugin

Right-click a selection in the editor, get a syntax-highlighted code screenshot.
The plugin is a thin wrapper around the [snipshot](../../../README.md) CLI, so the
images it produces are byte-for-byte the ones your docs, your CI and your agents
already generate.

What the existing IDE screenshot plugins don't do, and this one does:

- **the file path in the image header**, relative to the project root;
- **red / green annotations** — mark lines in the editor, then shoot;
- **folded regions** — collapse the noise into a `••• N lines folded •••` row;
- **several selections in one image** — multi-caret ranges, gaps folded automatically.

## Requirements

The snipshot CLI does the rendering. You do not have to install it by hand:
**Settings | Tools | Snipshot** has a **Download binary** button that fetches the
standalone build for your platform from the
[releases](https://github.com/9pings/snipshot/releases) and wires it up.

If you would rather manage it yourself, `npm install -g snipshot` or a binary of
your own both work — the plugin uses the configured path, else a downloaded
binary, else the first `snipshot` on your `PATH`. The **Check** button shows which
one it resolved and what version answered.

## Build & install

```bash
./gradlew buildPlugin
```

The installable archive lands in `build/distributions/snipshot-plugin-0.1.0.zip`.
Install it with **Settings | Plugins | ⚙ | Install Plugin from Disk…**, then restart.

To try it in a sandbox IDE instead:

```bash
./gradlew runIde
```

The IDE it builds against is set in `build.gradle.kts` (`intellijIdeaCommunity`),
with the matching compatibility range in `ideaVersion`. Bump both together.

The toolchain is pinned to a combination that is known to build: Gradle 8.10 with
the IntelliJ Platform Gradle Plugin 2.1.0, compiling on JDK 17. The build warns
that the platform plugin is outdated — 2.2 and later require Gradle 9, so moving up
means bumping Gradle and Kotlin at the same time. Building on JDK 25 fails in the
Kotlin plugin's version parsing; use JDK 17 or 21.

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
not a screenshot of the selection alone. A selection sitting inside one line is
outlined character by character (`--highlight-red 47:12-38`); a wider one is
highlighted line by line. If the selection is scrolled partly out of view, the shot
widens to keep it in frame.

### The quick flow

```
select line 47        → Alt+Shift+R    (turns red in the editor)
select lines 52-55    → Alt+Shift+G    (turns green)
select lines 40-60    → Alt+Shift+S
```

runs `snipshot <file> --lines 40-60 --highlight-red 47 --highlight-green 52-55`.

Marks are tinted in the editor, so what you see is what the image will carry. They
live for the session only and survive across shots until you clear them.

### What gets captured

- **A selection** → those lines.
- **Several selections** (multi-caret, `Alt`+click) → one range each; snipshot folds
  the gaps between them automatically.
- **No selection at all** → whatever is currently scrolled into view.

### Where images go

**Settings | Tools | Snipshot → Destination**, which defaults to the clipboard:

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

Context lines, page-fit limits and word wrap follow the CLI's defaults; change them
under **Rendering**, or per-shot in the **Snipshot…** dialog.

### Errors

The CLI's own message is shown in the balloon. The one you'll meet is the page-fit
guard — *"would be 91 lines, over the 70-line limit"*. Narrow the selection, fold a
section, or set **Max rows** to 0 in the settings to lift the limit.

## Layout

| File | Role |
|---|---|
| `SnipshotSettings.kt` | Persisted settings, and locating the binary on `PATH` |
| `SnipshotMarks.kt` | Per-file red/green/fold marks and their editor tint |
| `SnipshotRequest.kt` | The CLI invocation model, and reading the editor into one |
| `SnipshotRunner.kt` | Runs the CLI off the UI thread, reports success or failure |
| `SnipshotOutput.kt` | Delivers the result: clipboard, save dialog, or a folder |
| `SnipshotDownloader.kt` | Fetches the standalone binary from GitHub releases |
| `SnipshotOptionsDialog.kt` | The "Snipshot…" dialog |
| `SnipshotConfigurable.kt` | The settings page |
| `actions/` | The right-click actions |
