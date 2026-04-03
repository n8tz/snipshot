import { readFileSync, existsSync } from 'fs';
import { resolve, relative, dirname, join, extname } from 'path';

export function readSourceFile(filePath: string): string {
  const resolved = resolve(filePath);
  return readFileSync(resolved, 'utf-8');
}

const EXT_TO_LANG: Record<string, string> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.jsx': 'jsx',
  '.tsx': 'tsx',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.php': 'php',
  '.swift': 'swift',
  '.scala': 'scala',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.ps1': 'powershell',
  '.sql': 'sql',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.md': 'markdown',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.dart': 'dart',
  '.r': 'r',
  '.lua': 'lua',
  '.zig': 'zig',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.clj': 'clojure',
  '.groovy': 'groovy',
  '.pl': 'perl',
  '.tf': 'terraform',
  '.toml': 'toml',
  '.ini': 'ini',
  '.dockerfile': 'dockerfile',
};

export function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (EXT_TO_LANG[ext]) {
    return EXT_TO_LANG[ext];
  }

  const filename = filePath.split('/').pop() || '';
  if (filename === 'Dockerfile') return 'dockerfile';
  if (filename === 'Makefile') return 'makefile';

  return ext.slice(1) || 'text';
}

export function findProjectRoot(filePath: string, customRoot?: string): string {
  if (customRoot) return resolve(customRoot);

  let dir = dirname(resolve(filePath));
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return process.cwd();
}

export function getRelativePath(filePath: string, root: string): string {
  return relative(root, resolve(filePath));
}
