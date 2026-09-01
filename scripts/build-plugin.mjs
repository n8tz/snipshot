#!/usr/bin/env node

/**
 * Build the IntelliJ plugin and drop the installable zip next to the
 * standalone binaries, as standalone/intellij/snipshot-intellij-plugin.zip.
 *
 * The plugin is versioned from package.json, so a locally built zip matches
 * what a release of the same version ships.
 *
 * Usage:
 *   npm run build:plugin
 */

import { spawnSync, execFileSync } from 'child_process';
import { copyFileSync, mkdirSync, existsSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pluginDir = join(root, 'extra', 'intelij', 'snipshot-plugin');
const outDir = join(root, 'standalone', 'intellij');
const outFile = join(outDir, 'snipshot-intellij-plugin.zip');

const isWindows = process.platform === 'win32';
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

/**
 * Gradle needs a JDK 17 or newer to run. The plugin itself is compiled for Java
 * 17 through a Gradle toolchain, which Gradle downloads on the first build if
 * this JDK is not one, so any recent JDK works here.
 * Checked up front so the failure is a sentence rather than a stack trace.
 */
function checkJava() {
  const javaCmd = process.env.JAVA_HOME
    ? join(process.env.JAVA_HOME, 'bin', isWindows ? 'java.exe' : 'java')
    : 'java';

  const result = spawnSync(javaCmd, ['-version'], { encoding: 'utf-8' });
  if (result.error) {
    fail(
      'No JDK found.\n' +
      '  Install a JDK 17 or 21, or point JAVA_HOME at one.'
    );
  }

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const match = output.match(/version "(\d+)/);
  if (!match) {
    console.warn('  Could not read the Java version; building anyway.');
    return;
  }

  const major = Number(match[1]);
  if (major < 17) {
    fail(
      `Java ${major} is too old to build the plugin (needs 17 or newer).\n` +
      '  Install a recent JDK, or point JAVA_HOME at one:\n' +
      '    JAVA_HOME=/path/to/jdk npm run build:plugin'
    );
  }
  console.log(`  JDK ${major} — ok`);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

if (!existsSync(pluginDir)) {
  fail(`Plugin sources not found at ${pluginDir}`);
}

console.log(`Building the IntelliJ plugin (version ${version})...`);
console.log('  The first build downloads the IDE SDK and, if needed, a JDK 17 toolchain.');
checkJava();

const gradlew = join(pluginDir, isWindows ? 'gradlew.bat' : 'gradlew');
try {
  execFileSync(gradlew, ['buildPlugin', `-PpluginVersion=${version}`, '--no-daemon'], {
    cwd: pluginDir,
    stdio: 'inherit',
  });
} catch {
  fail('Gradle build failed (see the output above).');
}

const built = join(pluginDir, 'build', 'distributions', `snipshot-plugin-${version}.zip`);
if (!existsSync(built)) {
  fail(`Gradle did not produce ${built}`);
}

mkdirSync(outDir, { recursive: true });
copyFileSync(built, outFile);

const sizeKb = (statSync(outFile).size / 1024).toFixed(0);
console.log('\n' + '='.repeat(50));
console.log(`  standalone/intellij/snipshot-intellij-plugin.zip  (${sizeKb} KB)\n`);
console.log('Install it in the IDE with:');
console.log('  Settings | Plugins | gear icon | Install Plugin from Disk...');
