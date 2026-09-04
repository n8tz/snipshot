/**
 * VS Code's clipboard API is text-only, so an image goes on the clipboard
 * through a platform tool. This picks which one, from facts about the host.
 */
export type ClipboardStrategy =
  /** Native Windows: PowerShell + System.Windows.Forms. */
  | { kind: 'powershell' }
  /** Linux under WSL: the same PowerShell, reached through WSL interop. */
  | { kind: 'wsl' }
  | { kind: 'osascript' }
  | { kind: 'wl-copy' }
  | { kind: 'xclip' }
  | { kind: 'unreachable'; reason: string };

export interface HostInfo {
  platform: string;
  /** `vscode.env.remoteName`: undefined locally; "wsl", "ssh-remote", "dev-container", ... */
  remoteName: string | undefined;
  isWsl: boolean;
  waylandDisplay: string | undefined;
  hasCommand: (name: string) => boolean;
}

export function chooseClipboardStrategy(host: HostInfo): ClipboardStrategy {
  if (host.remoteName !== undefined && host.remoteName !== 'wsl') {
    return {
      kind: 'unreachable',
      reason: `the extension runs on the remote host (${host.remoteName}), whose clipboard is not the one you paste from`,
    };
  }
  if (host.platform === 'win32') return { kind: 'powershell' };
  if (host.isWsl) return { kind: 'wsl' };
  if (host.platform === 'darwin') return { kind: 'osascript' };
  if (host.platform === 'linux') {
    if (host.waylandDisplay && host.hasCommand('wl-copy')) return { kind: 'wl-copy' };
    if (host.hasCommand('xclip')) return { kind: 'xclip' };
    return { kind: 'unreachable', reason: 'no clipboard tool found: install wl-clipboard (Wayland) or xclip (X11)' };
  }
  return { kind: 'unreachable', reason: `no clipboard support on ${host.platform}` };
}
