import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
export function nativeFingerprint(cwd = process.cwd()) {
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const files = git(['ls-files', '-z']).split('\0').filter(file =>
    /^(package(?:-lock)?\.json|app\.json|app\.config\.[^/]+|modules\/|plugins\/|scripts\/with-|scripts\/patch-|assets\/brand\/)/.test(file)).sort();
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update('\0').update(git(['hash-object', '--path=' + file, file]).trim()).update('\0');
  return { algorithm: 'sha256-git-normalized-inputs-v1', fingerprint: hash.digest('hex'), files };
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/native-fingerprint.mjs')) console.log(JSON.stringify(nativeFingerprint(), null, 2));
