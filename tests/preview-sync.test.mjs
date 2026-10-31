import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('PC sync preserves dirty/ahead work and only fast-forwards clean branches', { skip: process.platform !== 'win32' }, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'runpen-sync-'));
  const seed = path.join(root, 'seed'), origin = path.join(root, 'origin.git'), pc = path.join(root, 'pc');
  const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const identity = cwd => { git(cwd, ['config', 'user.email', 'fixture@example.invalid']); git(cwd, ['config', 'user.name', 'Fixture']); };
  const sync = () => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(pc, 'preview.ps1'), 'Sync', '-Branch', 'main'], {
    cwd: pc, encoding: 'utf8', env: { ...process.env, PSModulePath: path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/Modules'), PATH: path.dirname(process.execPath) + ';' + process.env.PATH }, timeout: 30000,
  });
  try {
    mkdirSync(path.join(seed, 'scripts'), { recursive: true });
    git(seed, ['init', '-q', '-b', 'main']); identity(seed);
    for (const file of ['preview.ps1', 'scripts/preview-env.ps1', 'scripts/native-fingerprint.mjs']) copyFileSync(file, path.join(seed, file));
    writeFileSync(path.join(seed, '.gitignore'), 'node_modules/\n');
    writeFileSync(path.join(seed, 'package.json'), '{}\n');
    writeFileSync(path.join(seed, 'package-lock.json'), '{}\n');
    git(seed, ['add', '.']); git(seed, ['commit', '-qm', 'fixture']);
    git(root, ['clone', '--bare', seed, origin]); git(seed, ['remote', 'add', 'origin', origin]);
    git(root, ['clone', origin, pc]); identity(pc);
    mkdirSync(path.join(pc, 'node_modules'));
    const initial = git(pc, ['rev-parse', 'HEAD']);
    writeFileSync(path.join(pc, 'unsaved.txt'), 'preserve me');
    let result = sync();
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Local changes exist/);
    assert.equal(git(pc, ['rev-parse', 'HEAD']), initial);
    rmSync(path.join(pc, 'unsaved.txt'));
    writeFileSync(path.join(seed, 'screen.ts'), 'export const title = "remote";\n');
    git(seed, ['add', '.']); git(seed, ['commit', '-qm', 'remote change']); git(seed, ['push', 'origin', 'main']);
    result = sync(); assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(git(pc, ['rev-parse', 'HEAD']), git(seed, ['rev-parse', 'HEAD']));
    writeFileSync(path.join(pc, 'screen.ts'), 'export const title = "local";\n');
    git(pc, ['add', '.']); git(pc, ['commit', '-qm', 'unpublished local work']);
    const local = git(pc, ['rev-parse', 'HEAD']);
    result = sync(); assert.notEqual(result.status, 0); assert.match(result.stderr, /ahead or diverged/);
    assert.equal(git(pc, ['rev-parse', 'HEAD']), local);
  } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('runpen-sync-'));
    rmSync(root, { recursive: true, force: true });
  }
});
