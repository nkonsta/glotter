import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

export function checkVersionBump(basePackage, nextPackage, lockfile) {
  const baseVersion = basePackage?.version;
  const nextVersion = nextPackage?.version;

  for (const [label, version] of [['Base', baseVersion], ['Proposed', nextVersion]]) {
    if (typeof version !== 'string' || version !== version.trim() || version.startsWith('v') || !semver.valid(version)) {
      throw new Error(`${label} package.json must contain a valid semantic version without padding or a v prefix.`);
    }
  }

  if (!semver.gt(nextVersion, baseVersion)) {
    throw new Error(
      `Version ${nextVersion} must be greater than ${baseVersion} on main. ` +
      'Run npm version patch --no-git-tag-version (or use minor/major), then commit both package files.',
    );
  }

  if (lockfile?.version !== nextVersion || lockfile?.packages?.['']?.version !== nextVersion) {
    throw new Error('Both root versions in package-lock.json must match package.json. Run npm version to update both files.');
  }

  return `Version check passed: ${baseVersion} → ${nextVersion}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const baseRef = process.argv[2] || 'origin/main';
    const basePackage = JSON.parse(execFileSync('git', ['show', `${baseRef}:package.json`], { encoding: 'utf8' }));
    const nextPackage = JSON.parse(readFileSync('package.json', 'utf8'));
    const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    console.log(checkVersionBump(basePackage, nextPackage, lockfile));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
