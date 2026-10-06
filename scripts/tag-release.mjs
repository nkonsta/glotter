import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

export function tagRelease(ref = 'HEAD') {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const commit = git('rev-parse', '--verify', `${ref}^{commit}`);
  const { version } = JSON.parse(git('show', `${commit}:package.json`));
  if (typeof version !== 'string' || !semver.valid(version)) {
    throw new Error('The release commit must contain a valid package.json version.');
  }
  const tagRef = `refs/tags/${version}`;
  git('check-ref-format', tagRef);

  // Annotated tags have a separate object SHA; their peeled ref identifies
  // the commit. Lightweight tags already point directly at the commit.
  const remoteRefs = git('ls-remote', '--tags', 'origin', tagRef, `${tagRef}^{}`);
  const refs = new Map(remoteRefs.split('\n').filter(Boolean).map((line) => {
    const [sha, remoteRef] = line.split('\t');
    return [remoteRef, sha];
  }));
  const existingCommit = refs.get(`${tagRef}^{}`) || refs.get(tagRef);
  if (existingCommit) {
    if (existingCommit !== commit) {
      throw new Error(`Tag ${version} already points to ${existingCommit}; refusing to move it to ${commit}.`);
    }
    return `Tag ${version} already points to ${commit}; nothing to do.`;
  }

  // Never force or replace a tag. A conflicting tag created concurrently
  // will also cause the push to fail instead of changing release history.
  git('tag', '-a', version, commit, '-m', `Glotter ${version}`);
  git('push', 'origin', tagRef);
  return `Created and pushed tag ${version} for ${commit}.`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(tagRelease(process.argv[2] || 'HEAD'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
