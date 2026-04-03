import { readFileSync, existsSync } from 'fs';
import { resolve, relative, dirname, join, extname } from 'path';

export function readSourceFile(filePath: string): string {
  const resolved = resolve(filePath);
  return readFileSync(resolved, 'utf-8');
}

// Maps file extensions to Shiki language IDs.
// When the extension matches a Shiki lang ID directly (e.g. .go → go), no mapping is needed —
// the fallback in detectLanguage() handles it. This map is for extensions that differ.
const EXT_TO_LANG: Record<string, string> = {
  // JavaScript / TypeScript
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.jsx': 'jsx',
  '.tsx': 'tsx',

  // JVM
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.groovy': 'groovy',
  '.gvy': 'groovy',
  '.gradle': 'groovy',
  '.scala': 'scala',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.cljc': 'clojure',

  // Web / templating — fallback to closest supported syntax
  '.html': 'html',
  '.htm': 'html',
  '.xhtml': 'html',
  '.jsp': 'html',
  '.asp': 'html',
  '.aspx': 'html',
  '.ejs': 'html',
  '.hbs': 'handlebars',
  '.mustache': 'handlebars',
  '.pug': 'pug',
  '.jade': 'pug',
  '.erb': 'erb',
  '.twig': 'twig',
  '.blade': 'blade',
  '.njk': 'html',
  '.j2': 'jinja',
  '.jinja': 'jinja',
  '.jinja2': 'jinja',

  // CSS
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.styl': 'stylus',
  '.pcss': 'postcss',
  '.postcss': 'postcss',

  // Frameworks
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
  '.mdx': 'mdx',
  '.marko': 'marko',

  // C / C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.hh': 'cpp',
  '.ino': 'cpp',

  // .NET
  '.cs': 'csharp',
  '.fs': 'fsharp',
  '.fsx': 'fsharp',
  '.vb': 'vb',
  '.razor': 'razor',
  '.cshtml': 'razor',
  '.csx': 'csharp',
  '.xaml': 'xml',
  '.csproj': 'xml',
  '.fsproj': 'xml',
  '.sln': 'ini',

  // Python
  '.py': 'python',
  '.pyi': 'python',
  '.pyw': 'python',
  '.pyx': 'python',
  '.pxd': 'python',
  '.ipynb': 'python',

  // Ruby
  '.rb': 'ruby',
  '.rake': 'ruby',
  '.gemspec': 'ruby',
  '.podspec': 'ruby',

  // Rust
  '.rs': 'rust',

  // Go
  '.go': 'go',
  '.mod': 'go',
  '.sum': 'go',

  // Swift / Objective-C
  '.swift': 'swift',
  '.m': 'objective-c',
  '.mm': 'objective-cpp',

  // PHP
  '.php': 'php',
  '.phtml': 'php',
  '.php3': 'php',
  '.php4': 'php',
  '.php5': 'php',

  // Shell
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.fish': 'fish',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.psd1': 'powershell',
  '.bat': 'bat',
  '.cmd': 'bat',
  '.nu': 'nushell',

  // Data / config
  '.json': 'json',
  '.json5': 'json5',
  '.jsonc': 'jsonc',
  '.jsonl': 'jsonl',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.env': 'dotenv',
  '.properties': 'properties',
  '.xml': 'xml',
  '.xsl': 'xml',
  '.xsd': 'xml',
  '.svg': 'xml',
  '.plist': 'xml',
  '.csv': 'csv',
  '.tsv': 'tsv',

  // Markup / docs
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.rst': 'rst',
  '.tex': 'latex',
  '.latex': 'latex',
  '.typ': 'typst',
  '.adoc': 'asciidoc',
  '.wiki': 'wikitext',

  // SQL / DB
  '.sql': 'sql',
  '.psql': 'sql',
  '.plsql': 'plsql',
  '.prisma': 'prisma',

  // Functional
  '.hs': 'haskell',
  '.lhs': 'haskell',
  '.ml': 'ocaml',
  '.mli': 'ocaml',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.elm': 'elm',
  '.purs': 'purescript',
  '.rkt': 'racket',
  '.scm': 'scheme',
  '.lisp': 'common-lisp',
  '.cl': 'common-lisp',
  '.fnl': 'fennel',

  // Systems / low-level
  '.zig': 'zig',
  '.nim': 'nim',
  '.d': 'd',
  '.v': 'v',
  '.odin': 'odin',
  '.asm': 'asm',
  '.s': 'asm',
  '.wasm': 'wasm',
  '.wgsl': 'wgsl',
  '.glsl': 'glsl',
  '.hlsl': 'hlsl',
  '.metal': 'glsl',

  // Mobile
  '.dart': 'dart',

  // Scripting
  '.lua': 'lua',
  '.luau': 'luau',
  '.r': 'r',
  '.R': 'r',
  '.jl': 'julia',
  '.pl': 'perl',
  '.pm': 'perl',
  '.raku': 'perl6',
  '.tcl': 'tcl',
  '.awk': 'awk',
  '.sed': 'regex',

  // DevOps / IaC
  '.tf': 'terraform',
  '.tfvars': 'terraform',
  '.hcl': 'hcl',
  '.dockerfile': 'dockerfile',
  '.nginx': 'nginx',
  '.nix': 'nix',

  // GraphQL / API
  '.gql': 'graphql',
  '.graphql': 'graphql',
  '.proto': 'protobuf',

  // Game / creative
  '.gd': 'gdscript',
  '.gdshader': 'gdshader',
  '.wl': 'wolfram',
  '.mojo': 'mojo',
  '.move': 'move',
  '.sol': 'solidity',
  '.vy': 'vyper',
  '.cairo': 'cairo',

  // Misc
  '.diff': 'diff',
  '.patch': 'diff',
  '.log': 'log',
  '.vim': 'viml',
  '.vimrc': 'viml',
  '.applescript': 'applescript',
  '.cmake': 'cmake',
  '.make': 'makefile',
  '.mk': 'makefile',
  '.pas': 'pascal',
  '.pp': 'puppet',
  '.coffee': 'coffeescript',
  '.haml': 'haml',
  '.slim': 'pug',
  '.cr': 'crystal',
  '.hx': 'haxe',
  '.cobol': 'cobol',
  '.cob': 'cobol',
  '.cbl': 'cobol',
  '.f90': 'fortran-free-form',
  '.f95': 'fortran-free-form',
  '.f03': 'fortran-free-form',
  '.f08': 'fortran-free-form',
  '.f': 'fortran-fixed-form',
  '.for': 'fortran-fixed-form',
  '.prolog': 'prolog',
  '.pro': 'prolog',
  '.matlab': 'matlab',
  '.pkl': 'pkl',
  '.bicep': 'bicep',
  '.mmd': 'mermaid',
  '.mermaid': 'mermaid',
};

// Filenames (no extension) to language
const FILENAME_TO_LANG: Record<string, string> = {
  'Dockerfile': 'dockerfile',
  'Containerfile': 'dockerfile',
  'Makefile': 'makefile',
  'GNUmakefile': 'makefile',
  'CMakeLists.txt': 'cmake',
  'Gemfile': 'ruby',
  'Rakefile': 'ruby',
  'Vagrantfile': 'ruby',
  'Brewfile': 'ruby',
  'Justfile': 'just',
  'justfile': 'just',
  'Taskfile.yml': 'yaml',
  '.gitignore': 'ini',
  '.gitattributes': 'ini',
  '.editorconfig': 'ini',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
  'tsconfig.json': 'jsonc',
  '.env': 'dotenv',
  '.env.local': 'dotenv',
  '.env.production': 'dotenv',
  'nginx.conf': 'nginx',
  'Caddyfile': 'ini',
};

export function detectLanguage(filePath: string): string {
  const filename = filePath.split(/[/\\]/).pop() || '';

  // Check exact filename match first
  if (FILENAME_TO_LANG[filename]) {
    return FILENAME_TO_LANG[filename];
  }

  // Check extension
  const ext = extname(filename).toLowerCase();
  if (ext && EXT_TO_LANG[ext]) {
    return EXT_TO_LANG[ext];
  }

  // Fallback: use extension as-is (shiki might support it directly, e.g. .go → go)
  if (ext) {
    return ext.slice(1);
  }

  return 'text';
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
