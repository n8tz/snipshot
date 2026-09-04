# Snipshot for VS Code

Right-click a selection, get a syntax-highlighted code screenshot: on the
clipboard, or as a PNG or SVG file, with the file path in the header, red/green
annotations and folded regions.

![What it produces](https://raw.githubusercontent.com/9pings/snipshot/master/examples/java-controller.png)

The extension is a thin wrapper around the [snipshot](https://github.com/9pings/snipshot)
CLI, so the images it produces are the same ones your docs, your CI and your
agents already generate.

## What you get

Everything lives under **right-click → Snipshot** in the editor:

- **Snipshot this (red / green)** shoots the visible window with your selection
  outlined in it, so the annotation keeps its context.
- **Snipshot Selection**, **Copy Snipshot to Clipboard**, **Snipshot Selection as
  SVG**, and **Snipshot…** for every option in one form.
- **Mark Selection Red / Green / Folded** tints regions in the editor; one shot
  then carries them all.
- Several selections (multi-cursor) become several ranges in one image, gaps
  folded automatically.

## The snipshot binary

The CLI does the rendering. Run **Snipshot: Download Binary** from the Command
Palette to fetch the standalone build for your platform, or install it yourself
with `npm install -g snipshot` and, if needed, point `snipshot.executablePath` at
it. **Snipshot: Check Binary** shows which one is used and its version.

## Documentation

Usage, settings, and the notes on clipboards, WSL and remotes:
**[VSCODE.md](https://github.com/9pings/snipshot/blob/master/VSCODE.md)**.
