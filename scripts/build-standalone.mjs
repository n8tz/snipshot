#!/usr/bin/env node

/**
 * Build standalone executables for Linux, Windows, and macOS using Bun compile.
 *
 * Each platform gets a self-contained directory:
 *   codeshot-<platform>/
 *     codeshot(.exe)                    — Bun-compiled binary
 *     assets/JetBrainsMono-Regular.ttf  — embedded font
 *     node_modules/@napi-rs/canvas/     — native Skia binding (platform-specific)
 *
 * Usage:
 *   node scripts/build-standalone.mjs              # build all platforms
 *   node scripts/build-standalone.mjs linux         # build linux only
 *   node scripts/build-standalone.mjs linux,win     # build linux + windows
 */

import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'standalone');

const PLATFORMS = {
  linux: {
    bunTarget: 'bun-linux-x64',
    binaryName: 'codeshot',
    nativePackage: '@napi-rs/canvas-linux-x64-gnu',
    nodeFile: 'skia.linux-x64-gnu.node',
    dirName: 'codeshot-linux-x64',
  },
  win: {
    bunTarget: 'bun-windows-x64',
    binaryName: 'codeshot.exe',
    nativePackage: '@napi-rs/canvas-win32-x64-msvc',
    nodeFile: 'skia.win32-x64-msvc.node',
    dirName: 'codeshot-windows-x64',
  },
  'mac-intel': {
    bunTarget: 'bun-darwin-x64',
    binaryName: 'codeshot',
    nativePackage: '@napi-rs/canvas-darwin-x64',
    nodeFile: 'skia.darwin-x64.node',
    dirName: 'codeshot-macos-x64',
  },
  'mac-arm': {
    bunTarget: 'bun-darwin-arm64',
    binaryName: 'codeshot',
    nativePackage: '@napi-rs/canvas-darwin-arm64',
    nodeFile: 'skia.darwin-arm64.node',
    dirName: 'codeshot-macos-arm64',
  },
};

// Parse args: which platforms to build
const requestedArg = process.argv[2];
let selectedPlatforms;
if (requestedArg) {
  const requested = requestedArg.split(',').map(s => s.trim());
  selectedPlatforms = Object.entries(PLATFORMS).filter(([key]) => requested.includes(key));
  if (selectedPlatforms.length === 0) {
    console.error(`Unknown platform(s): ${requestedArg}`);
    console.error(`Available: ${Object.keys(PLATFORMS).join(', ')}`);
    process.exit(1);
  }
} else {
  selectedPlatforms = Object.entries(PLATFORMS);
}

// Ensure Bun is available
try {
  execFileSync('bun', ['--version'], { stdio: 'pipe' });
} catch {
  console.error('Error: Bun is required. Install it: curl -fsSL https://bun.sh/install | bash');
  process.exit(1);
}

// Clean output directory
if (existsSync(distDir)) rmSync(distDir, { recursive: true });
mkdirSync(distDir, { recursive: true });

// Step 1: Download platform-specific native packages via npm pack (bypasses os check)
console.log('Downloading platform-specific native packages...');
const tmpDir = join(root, '.tmp-native');
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

const nativePackages = selectedPlatforms.map(([, cfg]) => cfg.nativePackage);
const uniquePackages = [...new Set(nativePackages)];

// Map package name -> extracted directory
const extractedPkgs = new Map();

for (const pkg of uniquePackages) {
  const pkgParts = pkg.split('/');
  const localDir = join(root, 'node_modules', ...pkgParts);

  // If already installed locally (e.g. linux on linux), use that
  if (existsSync(localDir)) {
    console.log(`  ${pkg} — using local install`);
    extractedPkgs.set(pkg, localDir);
    continue;
  }

  // Download tarball via npm pack (works cross-platform)
  console.log(`  ${pkg} — downloading...`);
  try {
    const result = execFileSync('npm', ['pack', pkg, '--pack-destination', tmpDir], {
      cwd: tmpDir,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    const tgzName = result.trim();
    const tgzPath = join(tmpDir, tgzName);

    // Extract tarball
    const extractDir = join(tmpDir, pkg.replace('/', '-'));
    mkdirSync(extractDir, { recursive: true });
    execFileSync('tar', ['xzf', tgzPath, '-C', extractDir, '--strip-components=1'], { stdio: 'pipe' });

    extractedPkgs.set(pkg, extractDir);
    console.log(`  ${pkg} — OK`);
  } catch (err) {
    console.error(`  ${pkg} — FAILED: ${err.message}`);
  }
}

// Step 2: Build each platform
for (const [name, cfg] of selectedPlatforms) {
  console.log(`\nBuilding ${name} (${cfg.bunTarget})...`);

  const platformDir = join(distDir, cfg.dirName);
  mkdirSync(platformDir, { recursive: true });

  // Bun compile
  const outFile = join(platformDir, cfg.binaryName);
  const bunArgs = [
    'build', '--compile',
    `--target=${cfg.bunTarget}`,
    '--external', '@napi-rs/canvas',
    'src/index.ts',
    '--outfile', outFile,
  ];

  try {
    execFileSync('bun', bunArgs, { cwd: root, stdio: 'pipe' });
    console.log(`  Binary: ${cfg.binaryName}`);
  } catch (err) {
    console.error(`  FAILED to compile for ${name}: ${err.message}`);
    continue;
  }

  // Copy font
  const assetsDir = join(platformDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  cpSync(
    join(root, 'assets', 'JetBrainsMono-Regular.ttf'),
    join(assetsDir, 'JetBrainsMono-Regular.ttf'),
  );
  console.log('  Font: assets/JetBrainsMono-Regular.ttf');

  // Copy native canvas addon (JS wrapper + platform .node file)
  const canvasDst = join(platformDir, 'node_modules', '@napi-rs', 'canvas');
  mkdirSync(canvasDst, { recursive: true });

  // Copy only the JS files from @napi-rs/canvas (not all platform binaries)
  const canvasSrc = join(root, 'node_modules', '@napi-rs', 'canvas');
  for (const file of readdirSync(canvasSrc)) {
    if (file.endsWith('.js') || file.endsWith('.json') || file === 'LICENSE') {
      cpSync(join(canvasSrc, file), join(canvasDst, file));
    }
  }

  // Copy the platform-specific .node file
  const nativePkgDir = extractedPkgs.get(cfg.nativePackage);
  const nodeFileSrc = nativePkgDir ? join(nativePkgDir, cfg.nodeFile) : null;
  if (nodeFileSrc && existsSync(nodeFileSrc)) {
    cpSync(nodeFileSrc, join(canvasDst, cfg.nodeFile));
    console.log(`  Native: ${cfg.nodeFile}`);
  } else {
    console.error(`  WARNING: native addon for ${name} not found — binary may not work`);
  }

  // Show size
  const { size } = statSync(outFile);
  const sizeMB = (size / 1024 / 1024).toFixed(1);
  console.log(`  Size: ${sizeMB} MB (binary) + native addon`);
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('Build complete! Output:');
console.log('');
for (const [name, cfg] of selectedPlatforms) {
  const platformDir = join(distDir, cfg.dirName);
  if (existsSync(platformDir)) {
    console.log(`  ${cfg.dirName}/`);
    console.log(`    ./${cfg.binaryName} <file> --lines <range> [options]`);
  }
}
console.log('');
console.log('Each directory is self-contained. Copy it anywhere and run.');

// Cleanup temp
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
