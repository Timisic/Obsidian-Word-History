import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const render = resolve('scripts/render_png.mjs');
const publish = resolve('scripts/publish_profile.sh');
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

test('renderer uses the full viewBox at 2x and produces identical PNGs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chart-render-'));
  try {
    const svg = join(dir, 'chart.svg');
    await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 780 390"><rect x="10" y="20" width="780" height="390" fill="red"/><image href="https://example.invalid/no-network" width="20" height="20"/></svg>');
    const first = join(dir, 'first.png');
    const second = join(dir, 'second.png');
    run(process.execPath, [render, svg, first]);
    run(process.execPath, [render, svg, second]);
    const png = await readFile(first);
    assert.equal(png.readUInt32BE(16), 1560);
    assert.equal(png.readUInt32BE(20), 780);
    assert.deepEqual(png, await readFile(second));
    run(process.execPath, [render, resolve('assets/example-chart.svg'), join(dir, 'example.png')]);
    assert.ok((await readFile(join(dir, 'example.png'))).length > 10000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('publisher commits only the PNG and leaves an unchanged PNG as a no-op', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chart-publish-'));
  try {
    const remote = join(dir, 'remote.git');
    const repo = join(dir, 'profile');
    run('git', ['init', '--bare', remote]);
    run('git', ['clone', remote, repo]);
    run('git', ['config', 'user.name', 'Test'], repo);
    run('git', ['config', 'user.email', 'test@example.com'], repo);
    await writeFile(join(repo, 'README.md'), 'Profile\n');
    run('git', ['add', 'README.md'], repo);
    run('git', ['commit', '-m', 'Initial'], repo);
    run('git', ['push', 'origin', 'HEAD'], repo);
    const input = join(dir, 'chart.png');
    run(process.execPath, [render, resolve('assets/example-chart.svg'), input]);
    run(publish, [input, repo]);
    assert.equal(run('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], repo).trim(), 'assets/obsidian-notes-word-history.png');
    const head = run('git', ['rev-parse', 'HEAD'], repo);
    assert.match(run(publish, [input, repo]), /unchanged/);
    assert.equal(run('git', ['rev-parse', 'HEAD'], repo), head);
    assert.equal(run('git', ['status', '--porcelain'], repo), '');
    await writeFile(join(repo, 'unrelated.txt'), 'Private content');
    assert.throws(() => run(publish, [input, repo]), /Profile clone must be clean/);
    assert.equal(run('git', ['rev-parse', 'HEAD'], repo), head);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
