#!/usr/bin/env node

/**
 * Standalone entry point — extracts embedded native addon + font
 * to a cache directory on first run, then delegates to the main CLI.
 *
 * The build script generates _embedded.ts with base64-encoded data.
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
// @ts-ignore — generated at build time
import { NATIVE_B64, FONT_B64, NATIVE_HASH } from './_embedded.js';

const cacheDir = join(homedir(), '.snipshot');
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

// Extract native addon (skip if already cached with same hash)
const hashFile = join(cacheDir, '.hash');
const cachedHash = existsSync(hashFile) ? readFileSync(hashFile, 'utf-8').trim() : '';

if (cachedHash !== NATIVE_HASH) {
  const nodeData = Buffer.from(NATIVE_B64, 'base64');
  // Detect platform extension
  const ext = process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.node';
  writeFileSync(join(cacheDir, `skia${ext}`), nodeData, { mode: 0o755 });

  const fontData = Buffer.from(FONT_B64, 'base64');
  writeFileSync(join(cacheDir, 'JetBrainsMono-Regular.ttf'), fontData);

  writeFileSync(hashFile, NATIVE_HASH);
}

// Set paths before canvas is imported
const ext = process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.node';
process.env.NAPI_RS_NATIVE_LIBRARY_PATH = join(cacheDir, `skia${ext}`);
process.env.SNIPSHOT_FONT_PATH = join(cacheDir, 'JetBrainsMono-Regular.ttf');

// Now import the app
await import('./index.js');
