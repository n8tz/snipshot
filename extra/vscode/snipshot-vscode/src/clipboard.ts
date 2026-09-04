import * as fs from 'fs';
import * as vscode from 'vscode';
import { chooseClipboardStrategy, type ClipboardStrategy } from './clipboardStrategy.js';
import { findInPath, isWslHost } from './platform.js';
import { isFile, spawnCapture, type ProcessOutput } from './process.js';

/**
 * Puts a PNG on the clipboard. VS Code's clipboard API is text-only, so the
 * image is handed to a platform tool: PowerShell on Windows (and, through
 * interop, from inside WSL, where a Linux clipboard never reaches Windows
 * applications), osascript on macOS, wl-copy or xclip on Linux.
 */

const TIMEOUT_MS = 20_000;

const POWERSHELL_FALLBACKS = [
  '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
  '/mnt/c/Windows/system32/WindowsPowerShell/v1.0/powershell.exe',
];

/**
 * Set once the WSL bridge has failed. Interop does not come back mid-session,
 * and retrying costs a PowerShell spawn on every single shot.
 */
let wslUnavailable: string | undefined;

function procVersion(): string {
  try {
    return fs.readFileSync('/proc/version', 'utf8');
  } catch {
    return '';
  }
}

export function currentStrategy(): ClipboardStrategy {
  return chooseClipboardStrategy({
    platform: process.platform,
    remoteName: vscode.env.remoteName,
    isWsl: isWslHost(process.platform, process.env, procVersion()),
    waylandDisplay: process.env.WAYLAND_DISPLAY,
    hasCommand: name => findInPath(process.env.PATH, isFile, [name]) !== undefined,
  });
}

/** Copies the PNG at [file]. Returns undefined on success, else why not. */
export async function copyImageToClipboard(file: string): Promise<string | undefined> {
  const strategy = currentStrategy();
  switch (strategy.kind) {
    case 'unreachable':
      return strategy.reason;
    case 'powershell':
      return powershellCopy('powershell.exe', file);
    case 'wsl':
      return wslCopy(file);
    case 'osascript':
      return failureOf(await spawnCapture('osascript', [
        '-e', `set the clipboard to (read (POSIX file "${file.replace(/"/g, '\\"')}") as «class PNGf»)`,
      ], { timeoutMs: TIMEOUT_MS }));
    case 'wl-copy':
      return failureOf(await spawnCapture('wl-copy', ['--type', 'image/png'], {
        timeoutMs: TIMEOUT_MS, input: await fs.promises.readFile(file), ignoreOutput: true,
      }));
    case 'xclip':
      return failureOf(await spawnCapture('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-i', file], {
        timeoutMs: TIMEOUT_MS, ignoreOutput: true,
      }));
  }
}

function failureOf(output: ProcessOutput): string | undefined {
  if (output.error) return output.error;
  if (output.code === 0) return undefined;
  return output.stderr.trim() || `exit code ${output.code}`;
}

/**
 * One line on purpose: multi-line arguments do not survive the WSL interop
 * layer intact. SetDataObject(.., $true) is what keeps the image on the
 * clipboard once this PowerShell process exits; SetImage alone would lose
 * it. ErrorActionPreference plus the catch turn a .NET exception into a
 * non-zero exit code, which would otherwise stay 0.
 */
async function powershellCopy(powershell: string, windowsPath: string): Promise<string | undefined> {
  const script = [
    "$ErrorActionPreference='Stop';",
    'try {',
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;',
    `$img=[System.Drawing.Image]::FromFile('${windowsPath.replace(/'/g, "''")}');`,
    '[System.Windows.Forms.Clipboard]::SetDataObject($img,$true);',
    '$img.Dispose()',
    '} catch { Write-Error $_; exit 1 }',
  ].join(' ');
  return failureOf(await spawnCapture(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], { timeoutMs: TIMEOUT_MS }));
}

async function wslCopy(file: string): Promise<string | undefined> {
  if (wslUnavailable) return wslUnavailable;

  const powershell = await findPowershell();
  if (!powershell) return remember('powershell.exe not found, WSL interop looks disabled');

  const translated = await spawnCapture('wslpath', ['-w', file], { timeoutMs: TIMEOUT_MS });
  const windowsPath = translated.code === 0 ? translated.stdout.trim() : '';
  if (!windowsPath) return remember(`could not translate ${file} to a Windows path`);

  const failure = await powershellCopy(powershell, windowsPath);
  return failure ? remember(failure) : undefined;
}

function remember(reason: string): string {
  wslUnavailable = reason;
  return reason;
}

async function findPowershell(): Promise<string | undefined> {
  const probe = await spawnCapture('powershell.exe', ['-NoProfile', '-Command', 'exit 0'], { timeoutMs: TIMEOUT_MS });
  if (probe.code === 0) return 'powershell.exe';
  return POWERSHELL_FALLBACKS.find(isFile);
}
