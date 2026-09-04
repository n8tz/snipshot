#!/usr/bin/env node

/**
 * Build the VS Code extension and drop the installable .vsix next to the
 * standalone binaries, as standalone/vscode/snipshot-vscode-extension.vsix.
 *
 * The extension is versioned from package.json like the IntelliJ plugin: its
 * own manifest is brought in line first, so a locally built .vsix matches
 * what a release of the same version ships. The unit tests run as part of
 * the build, since the CI job for the extension is this script.
 *
 * Usage:
 *   npm run build:vscode
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const extensionDir = join(root, 'extra', 'vscode', 'snipshot-vscode');
const outDir = join(root, 'standalone', 'vscode');
const outFile = join(outDir, 'snipshot-vscode-extension.vsix');

const isWindows = process.platform === 'win32';
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/** vsce needs Node 20; the unit tests use `node --test` globs, Node 21. */
function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    fail(`Node ${process.versions.node} is too old to build the extension (needs 22 or newer).`);
  }
  console.log(`  Node ${process.versions.node} — ok`);
}

/** Rewrites the version in a JSON manifest, keeping everything else as is. */
function syncVersion(file, update) {
  const source = readFileSync(file, 'utf-8');
  const updated = update(source);
  if (updated !== source) {
    writeFileSync(file, updated);
    console.log(`  ${file.slice(root.length + 1)} → version ${version}`);
  }
}

function run(command, args) {
  execFileSync(command, args, { cwd: extensionDir, stdio: 'inherit', shell: isWindows });
}

if (!existsSync(extensionDir)) {
  fail(`Extension sources not found at ${extensionDir}`);
}

console.log(`Building the VS Code extension (version ${version})...`);
checkNode();

// package.json: the top-level "version"; package-lock.json: the top-level one
// and the root package entry, which npm keeps in sync with it.
syncVersion(join(extensionDir, 'package.json'), s =>
  s.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`));
syncVersion(join(extensionDir, 'package-lock.json'), s =>
  s.replace(/^(  "version":\s*")[^"]*(")/m, `$1${version}$2`)
    .replace(/^(    "": \{\n(?:.*\n)*?      "version":\s*")[^"]*(")/m, `$1${version}$2`));

if (process.env.CI || !existsSync(join(extensionDir, 'node_modules'))) {
  run('npm', ['ci', '--no-audit', '--no-fund']);
}

// Compiles, then runs the unit tests.
run('npm', ['test']);

mkdirSync(outDir, { recursive: true });
run(join(extensionDir, 'node_modules', '.bin', isWindows ? 'vsce.cmd' : 'vsce'), ['package', '--out', outFile]);

const sizeKb = (statSync(outFile).size / 1024).toFixed(0);
console.log('\n' + '='.repeat(50));
console.log(`  standalone/vscode/snipshot-vscode-extension.vsix  (${sizeKb} KB)\n`);
console.log('Install it in VS Code with:');
console.log('  Extensions view | ... menu | Install from VSIX...');
