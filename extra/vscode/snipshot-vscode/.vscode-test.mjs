// Integration tests: a real VS Code (downloaded into .vscode-test/) runs the
// extension in a throwaway copy of the fixture workspace. See
// integration/extension.test.ts and DEVELOPMENT.md.
import { defineConfig } from '@vscode/test-cli';
import { cpSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), 'snipshot-vscode-'));
cpSync(join(here, 'integration', 'fixtures'), workspace, { recursive: true });

export default defineConfig({
  files: 'out/integration/**/*.test.js',
  workspaceFolder: workspace,
  launchArgs: ['--disable-extensions', '--disable-workspace-trust'],
  mocha: { ui: 'bdd', timeout: 120_000, color: true },
  env: {
    SNIPSHOT_TEST_WORKSPACE: workspace,
    // The shim records the CLI's arguments there, then runs the real CLI.
    SNIPSHOT_SHIM_LOG: join(workspace, 'shim.log'),
    SNIPSHOT_SHIM_CLI: join(here, '..', '..', '..', 'dist', 'index.js'),
  },
});
