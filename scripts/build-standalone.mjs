#!/usr/bin/env node

/**
 * Build a standalone distributable bundle.
 *
 * Output: standalone/
 *   codeshot.cjs        — single-file JS bundle (all deps except native addon)
 *   codeshot             — Linux/macOS launcher
 *   codeshot.cmd         — Windows launcher
 *   assets/JetBrainsMono-Regular.ttf
 *   node_modules/@napi-rs/canvas/  — native addon (platform-specific)
 */

import { build } from 'esbuild';
import { cpSync, mkdirSync, writeFileSync, chmodSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'standalone');

// Clean
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

console.log('Bundling JS with esbuild...');

await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: join(outDir, 'codeshot.cjs'),
  // Native addons can't be bundled — keep them external
  external: ['@napi-rs/canvas'],
});

console.log('Copying font...');
mkdirSync(join(outDir, 'assets'), { recursive: true });
cpSync(
  join(root, 'assets', 'JetBrainsMono-Regular.ttf'),
  join(outDir, 'assets', 'JetBrainsMono-Regular.ttf'),
);

console.log('Copying native addon...');
// Copy the @napi-rs/canvas package (includes platform-specific .node binary)
const canvasSrc = join(root, 'node_modules', '@napi-rs', 'canvas');
const canvasDst = join(outDir, 'node_modules', '@napi-rs', 'canvas');
cpSync(canvasSrc, canvasDst, { recursive: true });

// Also copy platform-specific package if it exists in node_modules
const nativePackages = [
  'canvas-linux-x64-gnu',
  'canvas-linux-x64-musl',
  'canvas-linux-arm64-gnu',
  'canvas-win32-x64-msvc',
  'canvas-darwin-x64',
  'canvas-darwin-arm64',
];
for (const pkg of nativePackages) {
  const src = join(root, 'node_modules', '@napi-rs', pkg);
  if (existsSync(src)) {
    const dst = join(outDir, 'node_modules', '@napi-rs', pkg);
    cpSync(src, dst, { recursive: true });
    console.log(`  Copied @napi-rs/${pkg}`);
  }
}

console.log('Creating launchers...');

// Linux/macOS launcher
const shLauncher = `#!/bin/sh
exec node "$(dirname "$0")/codeshot.cjs" "$@"
`;
writeFileSync(join(outDir, 'codeshot'), shLauncher);
chmodSync(join(outDir, 'codeshot'), 0o755);
chmodSync(join(outDir, 'codeshot.cjs'), 0o755);

// Windows launcher
const cmdLauncher = `@echo off\r\nnode "%~dp0codeshot.cjs" %*\r\n`;
writeFileSync(join(outDir, 'codeshot.cmd'), cmdLauncher);

console.log('');
console.log('Standalone build complete!');
console.log(`  Output: ${outDir}`);
console.log('');
console.log('Usage:');
console.log('  Linux/macOS: ./standalone/codeshot <file> --lines <range>');
console.log('  Windows:     standalone\\codeshot.cmd <file> --lines <range>');
console.log('');
console.log('To install system-wide (Linux/macOS):');
console.log('  sudo cp -r standalone /opt/codeshot');
console.log('  sudo ln -s /opt/codeshot/codeshot /usr/local/bin/codeshot');
