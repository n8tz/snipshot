#!/usr/bin/env node

/**
 * Build truly standalone single-file executables for Linux, Windows, and macOS.
 *
 * The native Skia addon and font are embedded in the binary as base64.
 * On first run, they are extracted to ~/.snipshot/ and reused.
 *
 * Usage:
 *   node scripts/build-standalone.mjs              # build all platforms
 *   node scripts/build-standalone.mjs linux         # build linux only
 *   node scripts/build-standalone.mjs linux,win     # build linux + windows
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'standalone');

const PLATFORMS = {
  linux: {
    bunTarget: 'bun-linux-x64',
    binaryName: 'snipshot',
    nativePackage: '@napi-rs/canvas-linux-x64-gnu',
    nodeFile: 'skia.linux-x64-gnu.node',
  },
  win: {
    bunTarget: 'bun-windows-x64',
    binaryName: 'snipshot.exe',
    nativePackage: '@napi-rs/canvas-win32-x64-msvc',
    nodeFile: 'skia.win32-x64-msvc.node',
  },
  'mac-intel': {
    bunTarget: 'bun-darwin-x64',
    binaryName: 'snipshot',
    nativePackage: '@napi-rs/canvas-darwin-x64',
    nodeFile: 'skia.darwin-x64.node',
  },
  'mac-arm': {
    bunTarget: 'bun-darwin-arm64',
    binaryName: 'snipshot',
    nativePackage: '@napi-rs/canvas-darwin-arm64',
    nodeFile: 'skia.darwin-arm64.node',
  },
};

// Parse args
const requestedArg = process.argv[2];
let selectedPlatforms;
if (requestedArg) {
  const requested = requestedArg.split(',').map(s => s.trim());
  selectedPlatforms = Object.entries(PLATFORMS).filter(([key]) => requested.includes(key));
  if (selectedPlatforms.length === 0) {
    console.error(`Unknown platform(s): ${requestedArg}\nAvailable: ${Object.keys(PLATFORMS).join(', ')}`);
    process.exit(1);
  }
} else {
  selectedPlatforms = Object.entries(PLATFORMS);
}

// Ensure Bun
try { execFileSync('bun', ['--version'], { stdio: 'pipe' }); }
catch { console.error('Bun required: curl -fsSL https://bun.sh/install | bash'); process.exit(1); }

// Clean
if (existsSync(distDir)) rmSync(distDir, { recursive: true });
mkdirSync(distDir, { recursive: true });

// Download native packages
console.log('Downloading native addons...');
const tmpDir = join(root, '.tmp-native');
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

const uniquePackages = [...new Set(selectedPlatforms.map(([, cfg]) => cfg.nativePackage))];
const extractedPkgs = new Map();

for (const pkg of uniquePackages) {
  const localDir = join(root, 'node_modules', ...pkg.split('/'));
  if (existsSync(localDir)) {
    console.log(`  ${pkg} — local`);
    extractedPkgs.set(pkg, localDir);
    continue;
  }
  console.log(`  ${pkg} — downloading...`);
  try {
    const result = execFileSync('npm', ['pack', pkg, '--pack-destination', tmpDir], {
      cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8',
    });
    const extractDir = join(tmpDir, pkg.replace('/', '-'));
    mkdirSync(extractDir, { recursive: true });
    execFileSync('tar', ['xzf', join(tmpDir, result.trim()), '-C', extractDir, '--strip-components=1'], { stdio: 'pipe' });
    extractedPkgs.set(pkg, extractDir);
  } catch (err) {
    console.error(`  ${pkg} — FAILED: ${err.message}`);
  }
}

// Read font once
const fontPath = join(root, 'assets', 'JetBrainsMono-Regular.ttf');
const fontB64 = readFileSync(fontPath).toString('base64');

// Build each platform
const embeddedPath = join(root, 'src', '_embedded.ts');

for (const [name, cfg] of selectedPlatforms) {
  console.log(`\nBuilding ${name} (${cfg.bunTarget})...`);

  // Find the .node file
  const nativePkgDir = extractedPkgs.get(cfg.nativePackage);
  const nodeFileSrc = nativePkgDir ? join(nativePkgDir, cfg.nodeFile) : null;
  if (!nodeFileSrc || !existsSync(nodeFileSrc)) {
    console.error(`  SKIP — native addon not found`);
    continue;
  }

  // Encode native addon as base64
  console.log(`  Embedding ${cfg.nodeFile} (${(statSync(nodeFileSrc).size / 1024 / 1024).toFixed(1)} MB)...`);
  const nativeB64 = readFileSync(nodeFileSrc).toString('base64');
  const nativeHash = createHash('sha256').update(readFileSync(nodeFileSrc)).digest('hex').slice(0, 16);

  // Generate _embedded.ts
  writeFileSync(embeddedPath, [
    `export const NATIVE_B64 = "${nativeB64}";`,
    `export const FONT_B64 = "${fontB64}";`,
    `export const NATIVE_HASH = "${nativeHash}";`,
  ].join('\n'));

  // Temporarily replace @napi-rs/canvas/js-binding.js with a shim
  // that loads from NAPI_RS_NATIVE_LIBRARY_PATH env var.
  // This way Bun bundles the JS wrappers but the .node loads at runtime from cache.
  const jsBindingPath = join(root, 'node_modules', '@napi-rs', 'canvas', 'js-binding.js');
  const jsBindingBackup = readFileSync(jsBindingPath);
  writeFileSync(jsBindingPath, `module.exports = require(process.env.NAPI_RS_NATIVE_LIBRARY_PATH);\n`);

  // Bun compile — NO --external, so canvas JS wrappers are bundled
  const outFile = join(distDir, cfg.binaryName);
  try {
    execFileSync('bun', [
      'build', '--compile',
      `--target=${cfg.bunTarget}`,
      'src/standalone-entry.ts',
      '--outfile', outFile,
    ], { cwd: root, stdio: 'pipe' });
  } catch (err) {
    console.error(`  FAILED: ${err.stderr?.toString() || err.message}`);
    // Restore original before continuing
    writeFileSync(jsBindingPath, jsBindingBackup);
    continue;
  }

  // Restore original js-binding.js
  writeFileSync(jsBindingPath, jsBindingBackup);

  const binSize = (statSync(outFile).size / 1024 / 1024).toFixed(0);
  console.log(`  ${cfg.binaryName} — ${binSize} MB (single file)`);
}

// Cleanup
rmSync(embeddedPath, { force: true });
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });

// Summary
console.log('\n' + '='.repeat(50));
console.log('Build complete!\n');
for (const [, cfg] of selectedPlatforms) {
  const outFile = join(distDir, cfg.binaryName);
  if (existsSync(outFile)) {
    const size = (statSync(outFile).size / 1024 / 1024).toFixed(0);
    console.log(`  ${cfg.binaryName}  (${size} MB) — single file, fully standalone`);
  }
}
console.log('\nFirst run extracts native engine to ~/.snipshot/ (cached).');
