#!/usr/bin/env node
// Stands in for the snipshot binary during the integration tests: records the
// arguments it was called with, then runs the real CLI from the repo's dist/.
const fs = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
if (process.env.SNIPSHOT_SHIM_LOG) {
  fs.appendFileSync(process.env.SNIPSHOT_SHIM_LOG, JSON.stringify(args) + '\n');
}
const result = spawnSync(process.execPath, [process.env.SNIPSHOT_SHIM_CLI, ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
