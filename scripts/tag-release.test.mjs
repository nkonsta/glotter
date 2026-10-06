import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./tag-release.mjs', import.meta.url));
let directory;
let repository;
let remote;

function git(...args) {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commitVersion(version, marker = '') {
  writeFileSync(join(repository, 'package.json'), JSON.stringify({ version, marker }));
  git('add', 'package.json');
  git('commit', '-m', `version ${version} ${marker}`);
  return git('rev-parse', 'HEAD');
}

function run(ref = 'HEAD') {
  return spawnSync(process.execPath, [script, ref], { cwd: repository, encoding: 'utf8' });
}

describe('release tag automation', () => {
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'glotter-tag-'));
    repository = join(directory, 'repo');
    remote = join(directory, 'remote.git');
    execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
    execFileSync('git', ['init', '--initial-branch=main', repository], { stdio: 'pipe' });
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'release-test@example.com');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'tag.gpgsign', 'false');
    git('remote', 'add', 'origin', remote);
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it.each(['1.5.1', '1.6.0-rc.1', '1.6.0+build.2'])('creates and pushes an annotated tag for %s', (version) => {
    const commit = commitVersion(version);
    expect(run().status).toBe(0);
    expect(git('cat-file', '-t', `refs/tags/${version}`)).toBe('tag');
    expect(git('ls-remote', 'origin', `refs/tags/${version}^{}`)).toBe(`${commit}\trefs/tags/${version}^{}`);
  });

  it('tags each exact merge even if HEAD has advanced', () => {
    const first = commitVersion('1.5.1');
    const second = commitVersion('1.5.2');
    expect(run(first).status).toBe(0);
    expect(run(second).status).toBe(0);
    expect(git('rev-parse', '1.5.1^{}')).toBe(first);
    expect(git('rev-parse', '1.5.2^{}')).toBe(second);
    expect(git('ls-remote', '--tags', 'origin')).toContain('refs/tags/1.5.2^{}');
  });

  it.each(['annotated', 'lightweight'])('skips an existing correct %s tag', (type) => {
    commitVersion('1.5.1');
    if (type === 'annotated') git('tag', '-a', '1.5.1', '-m', 'Existing release');
    else git('tag', '1.5.1');
    git('push', 'origin', 'refs/tags/1.5.1');
    const before = git('ls-remote', '--tags', 'origin');
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('nothing to do');
    expect(git('ls-remote', '--tags', 'origin')).toBe(before);
  });

  it.each(['annotated', 'lightweight'])('refuses to move an existing %s tag', (type) => {
    commitVersion('1.5.1', 'original');
    if (type === 'annotated') git('tag', '-a', '1.5.1', '-m', 'Existing release');
    else git('tag', '1.5.1');
    git('push', 'origin', 'refs/tags/1.5.1');
    const before = git('ls-remote', '--tags', 'origin');
    commitVersion('1.5.1', 'different commit');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refusing to move');
    expect(git('ls-remote', '--tags', 'origin')).toBe(before);
  });

  it.each(['latest', 'v1.5.1', ' 1.5.1 '])('rejects invalid version %s without creating a tag', (version) => {
    commitVersion(version);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('valid package.json version');
    expect(git('tag', '--list')).toBe('');
  });

  it('fails on remote access errors instead of assuming the tag is absent', () => {
    commitVersion('1.5.1');
    git('remote', 'set-url', 'origin', join(directory, 'missing.git'));
    expect(run().status).toBe(1);
    expect(git('tag', '--list')).toBe('');
  });
});
