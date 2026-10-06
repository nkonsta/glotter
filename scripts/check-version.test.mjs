import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkVersionBump } from './check-version.mjs';

function lockfile(version) {
  return { version, packages: { '': { version } } };
}

describe('required version bump', () => {
  it.each(['1.5.1', '1.6.0', '2.0.0', '1.10.0'])(
    'accepts a higher version: %s',
    (version) => expect(checkVersionBump({ version: '1.5.0' }, { version }, lockfile(version))).toContain(version),
  );

  it.each(['1.5.0', '1.4.9', '1.5.0+build.2', '1.5.0-rc.1'])(
    'rejects an unchanged or lower version: %s',
    (version) => expect(() => checkVersionBump({ version: '1.5.0' }, { version }, lockfile(version))).toThrow('must be greater'),
  );

  it.each([undefined, 123, 'latest', '1.5', '01.5.1'])(
    'rejects an invalid proposed version: %s',
    (version) => expect(() => checkVersionBump({ version: '1.5.0' }, { version }, lockfile(version))).toThrow('Proposed package.json'),
  );

  it('rejects an invalid base version', () => {
    expect(() => checkVersionBump({}, { version: '1.5.1' }, lockfile('1.5.1'))).toThrow('Base package.json');
  });

  it('accepts promotion from a prerelease to a release', () => {
    expect(checkVersionBump({ version: '1.5.1-rc.1' }, { version: '1.5.1' }, lockfile('1.5.1'))).toContain('passed');
  });

  it.each([
    undefined,
    { version: '1.5.0', packages: { '': { version: '1.5.1' } } },
    { version: '1.5.1', packages: { '': { version: '1.5.0' } } },
    { version: '1.5.1' },
  ])('rejects missing or inconsistent lockfile versions', (lock) => {
    expect(() => checkVersionBump({ version: '1.5.0' }, { version: '1.5.1' }, lock)).toThrow('package-lock.json');
  });

  it('rejects a duplicate bump after main advances', () => {
    expect(() => checkVersionBump({ version: '1.5.1' }, { version: '1.5.1' }, lockfile('1.5.1'))).toThrow('must be greater');
  });

  it('checks a real Git base ref and returns failure for a missing base', () => {
    const directory = mkdtempSync(join(tmpdir(), 'glotter-version-'));
    const script = fileURLToPath(new URL('./check-version.mjs', import.meta.url));
    const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
    const writePackage = (version) => writeFileSync(join(directory, 'package.json'), JSON.stringify({ version }));
    const run = (ref) => spawnSync(process.execPath, [script, ref], { cwd: directory, encoding: 'utf8' });

    try {
      git('init');
      writePackage('1.5.0');
      git('add', 'package.json');
      git('-c', 'user.name=Version Test', '-c', 'user.email=version-test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-m', 'base');
      writePackage('1.5.1');
      writeFileSync(join(directory, 'package-lock.json'), JSON.stringify(lockfile('1.5.1')));
      expect(run('HEAD').status).toBe(0);

      writePackage('1.5.0');
      expect(run('HEAD').status).toBe(1);
      expect(run('missing-ref').status).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
