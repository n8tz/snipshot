#!/usr/bin/env node

import { Command } from 'commander';
import { parseLineRange, parseHighlightSpec } from './parser.js';
import { generateCodeShot } from './pipeline.js';
import type { HighlightSpec } from './types.js';

function collect(value: string, previous: string[]) {
  return previous.concat([value]);
}

const program = new Command();

program
  .name('codeshot')
  .description('Generate PNG screenshots of code snippets with syntax highlighting')
  .version('0.1.0')
  .argument('<file>', 'path to the source file')
  .requiredOption('--lines <range>', 'line range to capture (e.g. 42-56)')
  .option('--highlight-red <spec>', 'highlight in red (repeatable)', collect, [])
  .option('--highlight-green <spec>', 'highlight in green (repeatable)', collect, [])
  .option('--output <path>', 'output file path')
  .option('--root <path>', 'project root for relative path display')
  .action(async (file: string, opts: {
    lines: string;
    highlightRed: string[];
    highlightGreen: string[];
    output?: string;
    root?: string;
  }) => {
    try {
      const lineRange = parseLineRange(opts.lines);

      const highlights: HighlightSpec[] = [
        ...opts.highlightRed.map(s => parseHighlightSpec(s, 'red')),
        ...opts.highlightGreen.map(s => parseHighlightSpec(s, 'green')),
      ];

      const outputPath = await generateCodeShot({
        filePath: file,
        lineRange,
        highlights,
        outputPath: opts.output || '',
        rootPath: opts.root,
      });

      console.log(`Screenshot saved to: ${outputPath}`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
