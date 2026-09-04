import * as path from 'path';

export interface ReleaseTarget {
  asset: string;
  binaryName: string;
}

/** Release assets carry no version, which keeps this URL stable. */
const LATEST_DOWNLOAD = 'https://github.com/9pings/snipshot/releases/latest/download';

/** The release asset for a machine, or undefined when we do not ship one. */
export function releaseTarget(platform: string, arch: string): ReleaseTarget | undefined {
  if (platform === 'win32') return { asset: 'snipshot-windows-x64.zip', binaryName: 'snipshot.exe' };
  if (platform === 'darwin' && arch === 'arm64') return { asset: 'snipshot-macos-arm64.tar.gz', binaryName: 'snipshot' };
  if (platform === 'darwin') return { asset: 'snipshot-macos-x64.tar.gz', binaryName: 'snipshot' };
  if (platform === 'linux' && arch !== 'arm64') return { asset: 'snipshot-linux-x64.tar.gz', binaryName: 'snipshot' };
  return undefined;
}

export function downloadUrl(target: ReleaseTarget): string {
  return `${LATEST_DOWNLOAD}/${target.asset}`;
}

/** npm installs a shim whose name differs per OS, so try every spelling. */
export const EXECUTABLE_CANDIDATES = ['snipshot', 'snipshot.cmd', 'snipshot.exe', 'snipshot.bat'];

/** The first candidate found in a PATH-like variable; [isFile] abstracts the disk. */
export function findInPath(
  pathVar: string | undefined,
  isFile: (file: string) => boolean,
  candidates: string[] = EXECUTABLE_CANDIDATES,
  delimiter: string = path.delimiter,
): string | undefined {
  for (const dir of (pathVar ?? '').split(delimiter).filter(d => d !== '')) {
    for (const name of candidates) {
      const candidate = path.join(dir, name);
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

/** True inside WSL, where a Linux clipboard never reaches Windows applications. */
export function isWslHost(platform: string, env: Record<string, string | undefined>, procVersion: string): boolean {
  if (platform !== 'linux') return false;
  return env.WSL_DISTRO_NAME !== undefined || /microsoft/i.test(procVersion);
}
