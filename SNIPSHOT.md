# snipshot — CLI reference for AI agents

`snipshot` generates PNG screenshots of code with syntax highlighting (or SVG documents with `--svg`, or ANSI-colored terminal text with `--ansi`). Use it to produce visual code snippets for reports, documentation, or reviews.

## Command

```
snipshot <file> --lines <ranges> [options]
```

## Required

- `<file>` — path to the source file (language auto-detected from extension)
- `--lines <ranges>` — line range(s) to capture (1-based, inclusive): a single line `42`, a range `42-56`, or several comma-separated ranges `10-14,42-56`. With several ranges the snippet spans from the first to the last, and the gaps between them (beyond each range's context lines) are folded automatically.

## Options

- `--highlight-red <specs>` — outline in red. Accepts a comma-separated list and/or repeat the flag.
- `--highlight-green <specs>` — outline in green. Accepts a comma-separated list and/or repeat the flag.
- `--fold <ranges>` — collapse line ranges into a single `••• N lines folded •••` indicator. Comma-separated list and/or repeatable. Use this to hide imports, boilerplate, or unrelated sections while keeping the lines you care about visible.
- `--context <n>` — lines of context shown before/after `--lines`, clamped to the file. Default: `3`.
- `--no-context` — show exactly the requested lines (same as `--context 0`).
- `--max-lines <n>` — error if the result exceeds this many rendered rows, so the image fits on one page. Default: `70`. Folds count as 1 row; wrapped lines count each row.
- `--no-max-lines` — disable the rendered-rows limit.
- `--theme <name>` — color theme: `dark` (default, One Dark Pro) or `light` (One Light).
- `--max-width <pixels>` — cap image width with word wrap. Default: `800` (≈ a page width, so it fits a document). Increase for wider code.
- `--no-max-width` — disable word wrap; the image grows as wide as the longest line.
- `--svg` — write an SVG document instead of a PNG. Default name: `<filename>_L<start>-<end>.svg`. Same layout as the PNG (header, gutter, folds, wrapping, highlights); scalable and much smaller. Conflicts with `--ansi`.
- `--ansi` — print the snippet to stdout as ANSI-colored text (24-bit truecolor) instead of writing a file: same header, line numbers, folds and red/green highlights. Lines are not wrapped (`--max-width` is ignored). With `--output <path>`, the colored text is saved to that file instead of printed. Conflicts with `--svg`.
- `--output <path>` — output PNG (or SVG) path. Default: `<filename>_L<start>-<end>.png` (or `.svg`) in cwd.
- `--root <path>` — project root for the relative path shown in the header. Default: the nearest `.git` directory above the file; if none is found, the current working directory.

## Highlight / fold spec format

Each `--highlight-*` and `--fold` flag takes one or more comma-separated targets (and the flag can also be repeated):

- `47` — entire line 47
- `47-50` — lines 47 through 50
- `47:12-38` — line 47, columns 12 to 38 (highlights only — draws a box around those characters)

All numbers are 1-based and inclusive. Combine several in one flag with commas:

```bash
# These two are equivalent:
snipshot file.java --lines 40-60 --highlight-red 45,50:10-30 --highlight-green 55
snipshot file.java --lines 40-60 --highlight-red 45 --highlight-red 50:10-30 --highlight-green 55
```

## Typical usage patterns

**Basic snippet:**
```bash
snipshot src/auth/login.ts --lines 20-45
```

**Highlight a problematic line in red:**
```bash
snipshot src/api/handler.go --lines 100-120 --highlight-red 112
```

**Compare old (red) vs new (green) approach:**
```bash
snipshot src/utils.py --lines 30-50 --highlight-red 35-38 --highlight-green 42-45
```

**Highlight a specific expression (columns):**
```bash
snipshot src/config.ts --lines 10-15 --highlight-red 12:25-60
```

**Report-friendly width with word wrap:**
```bash
snipshot src/controller.java --lines 1-30 --max-width 700
```

**Fold noisy sections (imports, boilerplate) while keeping key code visible:**
```bash
snipshot src/service.ts --lines 1-120 --fold 1-25 --fold 80-100 --highlight-red 55
```

**Capture several separate sections at once (gaps folded automatically):**
```bash
snipshot src/service.ts --lines 10-14,42-56,80-95 --highlight-red 47
```

**Custom output path:**
```bash
snipshot src/app.tsx --lines 50-80 --output docs/images/app-snippet.png
```

**Light theme:**
```bash
snipshot src/app.tsx --lines 50-80 --theme light
```

**SVG output (scalable, small — good for docs/web):**
```bash
snipshot src/app.tsx --lines 50-80 --svg
```

**Show the snippet directly in the terminal (no file written):**
```bash
snipshot src/app.tsx --lines 50-80 --highlight-red 55 --ansi
```

**Large extract that won't fit a page — fold the noise or lift the limit:**
```bash
snipshot src/service.ts --lines 1-200 --fold 1-30,120-180   # collapse to fit
snipshot src/service.ts --lines 1-200 --no-max-lines        # allow a tall image
```

## Behavior notes

- The full file is read and tokenized (not just the selected lines) so syntax highlighting is always accurate, even for mid-file extracts.
- Line numbers in the output match the original file.
- By default 3 lines of context are rendered before and after each `--lines` range (clamped to the file). Disable with `--no-context` or change with `--context <n>`. Context does not affect the output filename.
- With several `--lines` ranges, overlapping/touching ranges are merged, and each gap between ranges is collapsed into a `••• N lines folded •••` row (unless it hides fewer than 2 lines, in which case it is simply shown). The default output filename joins the ranges with `+`, e.g. `service_L10-14+42-56.png`.
- The command **errors** if the result would exceed 70 rendered rows, so screenshots fit on a single page. Folded ranges count as 1 row; wrapped lines count each row. Raise with `--max-lines <n>` or remove with `--no-max-lines`. To recover, narrow `--lines`, add `--fold`, or pass `--no-max-lines`.
- Tabs are expanded to 4 spaces.
- Long lines word-wrap at `--max-width` (default `800px` ≈ a page) with a `↳` continuation indicator; line numbers are only shown on the first visual row. Pass `--no-max-width` for a single wide line per source line.
- Full-line highlights (`--highlight-red 47`) show a tinted background with a colored left border.
- Column highlights (`--highlight-red 47:12-38`) draw a colored rectangle around the specified characters. They work correctly across wrapped lines.
- `--fold` ranges are clipped to the `--lines` window, so you can safely fold beyond the captured range. Folded lines render as a single `••• N lines folded •••` row with a dotted gutter marker. Highlights that fall inside a folded range are hidden.
- Language is auto-detected from 150+ file extensions (and common filenames like `Dockerfile`, `Makefile`). Unknown or unsupported types fall back to plaintext rendering — the screenshot still succeeds, just without syntax colors.
- Output is PNG by default (never JPG). `--svg` writes an SVG with the identical layout; `--ansi` prints ANSI-colored text to stdout (or to `--output` if given) and exits without creating an image.
- In `--ansi` mode, full-line highlights render as a tinted background band with a `▎` left bar; column highlights render underlined with a stronger tint (terminals can't draw boxes). Requires a truecolor (24-bit) terminal — standard in modern terminals.
- SVG output does not embed the font: it declares JetBrains Mono with a monospace fallback stack, and per-token `textLength` keeps alignment exact whatever font actually renders.
- The header displays the file path relative to the project root (see `--root`). Without a `.git` ancestor and without `--root`, the root is the current working directory, so a file outside it shows a `../`-prefixed path — run from the right directory or pass `--root` to control this.
- The `--theme` flag switches both the syntax colors and the editor chrome (background, gutter, header). Default is `dark`.
- Running `snipshot` with no arguments prints the help text (exit 0) instead of an error.
