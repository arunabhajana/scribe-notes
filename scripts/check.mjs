import { spawnSync } from 'node:child_process';

// Run through npm's own CLI for consistent Windows/Linux behavior and fail fast.
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this gate with npm run check.');
const steps = ['version:check', 'lint', 'typecheck', 'test:coverage', 'security:check', 'build'];
for (const step of steps) {
  console.log(`\nChecking ${step}...`);
  const result = spawnSync(process.execPath, [npm, 'run', step], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('\nAll frontend checks passed.');
