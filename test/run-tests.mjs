import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

for (const args of [
  ['--test', ...readdirSync('test').filter(name => name.endsWith('.test.mjs')).map(name => `test/${name}`)],
  ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', '--config', 'jest.legacy.config.mjs', '--runInBand'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
