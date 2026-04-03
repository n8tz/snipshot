# snipshot — CLI reference for AI agents

`snipshot` generates PNG screenshots of code with syntax highlighting. Use it to produce visual code snippets for reports, documentation, or reviews.

## Command

```
snipshot <file> --lines <start>-<end> [options]
```

## Required

- `<file>` — path to the source file (language auto-detected from extension)
- `--lines <start>-<end>` — line range to capture (1-based, inclusive)

## Options

- `--highlight-red <spec>` — outline in red. Repeatable.
- `--highlight-green <spec>` — outline in green. Repeatable.
- `--max-width <pixels>` — cap image width, wraps long lines. Use 700-800 for reports.
- `--output <path>` — output PNG path. Default: `<filename>_L<start>-<end>.png` in cwd.
- `--root <path>` — project root for the relative path shown in the header. Default: auto-detected via `.git`.

## Highlight spec format

A highlight spec targets lines or character ranges:

- `47` — entire line 47
- `47-50` — lines 47 through 50
- `47:12-38` — line 47, columns 12 to 38 (1-based, inclusive)

Multiple highlights can be combined by repeating the flag:

```bash
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

**Custom output path:**
```bash
snipshot src/app.tsx --lines 50-80 --output docs/images/app-snippet.png
```

## Behavior notes

- The full file is read and tokenized (not just the selected lines) so syntax highlighting is always accurate, even for mid-file extracts.
- Line numbers in the output match the original file.
- Tabs are expanded to 4 spaces.
- When `--max-width` is set, long lines wrap with a `↳` continuation indicator. Line numbers are only shown on the first visual row.
- Full-line highlights (`--highlight-red 47`) show a tinted background with a colored left border.
- Column highlights (`--highlight-red 47:12-38`) draw a colored rectangle around the specified characters. They work correctly across wrapped lines.
- Output is always PNG (not JPG).
- The header displays the file path relative to the project root.
