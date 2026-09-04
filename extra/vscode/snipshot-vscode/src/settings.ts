import * as vscode from 'vscode';

export type Destination = 'clipboard' | 'ask' | 'projectSnipshot' | 'projectRoot' | 'custom';
export type ThemeSetting = 'auto' | 'dark' | 'light';

/** The `snipshot.*` settings, read fresh on every shot. */
export interface Settings {
  /** Empty = look the binary up (downloaded, then PATH). */
  executablePath: string;
  destination: Destination;
  /** Only used when destination is "custom". */
  customDirectory: string;
  /** Format of the plain Snipshot actions. */
  format: 'png' | 'svg';
  openAfterSave: boolean;
  theme: ThemeSetting;
  contextLines: number;
  /** 0 disables word wrap (--no-max-width). */
  maxWidth: number;
  /** 0 disables the row limit (--no-max-lines). */
  maxLines: number;
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('snipshot');
  return {
    executablePath: config.get<string>('executablePath', '').trim(),
    destination: config.get<Destination>('destination', 'clipboard'),
    customDirectory: config.get<string>('customDirectory', '').trim(),
    format: config.get<'png' | 'svg'>('format', 'png'),
    openAfterSave: config.get<boolean>('openAfterSave', false),
    theme: config.get<ThemeSetting>('theme', 'auto'),
    contextLines: config.get<number>('contextLines', 3),
    maxWidth: config.get<number>('maxWidth', 800),
    maxLines: config.get<number>('maxLines', 70),
  };
}

/** "auto" resolves against the active color theme. */
export function resolveTheme(theme: ThemeSetting): 'dark' | 'light' {
  if (theme !== 'auto') return theme;
  const kind = vscode.window.activeColorTheme.kind;
  const light = kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
  return light ? 'light' : 'dark';
}

const LAST_SAVE_DIRECTORY = 'snipshot.lastSaveDirectory';

/** Folder the last image was saved into through the dialog, reused by it. */
export function lastSaveDirectory(context: vscode.ExtensionContext): string | undefined {
  return context.globalState.get<string>(LAST_SAVE_DIRECTORY);
}

export function rememberSaveDirectory(context: vscode.ExtensionContext, directory: string): Thenable<void> {
  return context.globalState.update(LAST_SAVE_DIRECTORY, directory);
}
