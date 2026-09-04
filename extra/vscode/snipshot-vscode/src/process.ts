import { spawn } from 'child_process';
import * as fs from 'fs';

export interface ProcessOutput {
  /** Null when the process could not start or was killed. */
  code: number | null;
  stdout: string;
  stderr: string;
  /** Why it did not run to completion. */
  error?: string;
}

export interface SpawnOptions {
  cwd?: string;
  timeoutMs: number;
  /** Written to stdin, which is closed either way. */
  input?: Buffer;
  /**
   * For tools that fork to keep serving the clipboard (xclip, wl-copy): their
   * pipes never close, so resolve on exit and do not read the output.
   */
  ignoreOutput?: boolean;
}

export function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Runs a command to completion and captures its output; never throws. */
export function spawnCapture(command: string, args: string[], options: SpawnOptions): Promise<ProcessOutput> {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (output: ProcessOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(output);
    };

    // npm's Windows shim is a .cmd, which only cmd.exe can run.
    const shim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
    const child = shim
      ? spawn('cmd.exe', ['/d', '/s', '/c', `"${[command, ...args].map(quoteForCmd).join(' ')}"`], {
        cwd: options.cwd, windowsVerbatimArguments: true, windowsHide: true,
      })
      : spawn(command, args, {
        cwd: options.cwd, windowsHide: true,
        stdio: options.ignoreOutput ? ['pipe', 'ignore', 'ignore'] : 'pipe',
      });

    const timer = setTimeout(() => {
      child.kill();
      finish({ code: null, stdout, stderr, error: `timed out after ${options.timeoutMs / 1000}s` });
    }, options.timeoutMs);

    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', err => finish({ code: null, stdout, stderr, error: err.message }));
    child.on(options.ignoreOutput ? 'exit' : 'close', code => finish({ code, stdout, stderr }));
    child.stdin?.on('error', () => { /* the tool may exit before reading */ });
    child.stdin?.end(options.input);
  });
}

function quoteForCmd(arg: string): string {
  return `"${arg.replace(/"/g, '\\"')}"`;
}
