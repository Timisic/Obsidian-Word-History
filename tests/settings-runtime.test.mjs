import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
function loadPlugin() {
  class Plugin { async saveData() {} }
  const context = { module: { exports: {} }, require: name => name === 'obsidian' ? { Plugin, PluginSettingTab: class {}, Notice: class {} } : require(name), console: { error() {} }, setTimeout, clearTimeout, Buffer, process };
  vm.runInNewContext(readFileSync(resolve('main.js'), 'utf8'), context);
  return context.module.exports;
}

test('UI, command and timer share one run; failure releases it and retry generates a real chart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'word-history-runtime-'));
  const { default: Plugin, DEFAULT_SETTINGS } = loadPlugin();
  const plugin = new Plugin();
  plugin.settings = { ...DEFAULT_SETTINGS };
  plugin.app = { vault: { adapter: { getBasePath: () => dir }, configDir: '.obsidian' } };
  plugin.manifest = { id: 'word-history' };
  try {
    const first = plugin.runGenerator({ silent: true });
    assert.equal(plugin.isGenerating, true);
    assert.equal(plugin.runGenerator({ silent: false }), first);
    assert.throws(() => plugin.resetCache(), /Wait for generation/);
    await first;
    assert.equal(plugin.isGenerating, false);
    assert.ok(plugin.settings.lastRunError);
    assert.equal(plugin.settings.lastRunAt, 0);
    const git = args => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    git(['init']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.com']);
    writeFileSync(join(dir, 'note.md'), 'Writing a real note.');
    git(['add', 'note.md']); git(['commit', '-m', 'Initial note']);
    const retry = plugin.runGenerator({ silent: true });
    assert.notEqual(retry, first);
    assert.equal(plugin.runGenerator({ silent: true }), retry);
    await Promise.resolve();
    plugin.settings.outputPath = 'Reference/next.svg';
    await retry;
    assert.equal(plugin.settings.lastRunError, '');
    assert.equal(plugin.isGenerating, false);
    assert.ok(plugin.settings.lastTotalWords > 0);
    assert.ok(existsSync(join(dir, 'Reference/chart.svg')));
    assert.equal(existsSync(join(dir, 'Reference/next.svg')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('embed uses the resolved vault boundary, including normalized parent escapes', () => {
  const { default: Plugin, DEFAULT_SETTINGS } = loadPlugin();
  const plugin = new Plugin();
  plugin.settings = { ...DEFAULT_SETTINGS };
  plugin.app = { vault: { adapter: { getBasePath: () => '/vault' } } };
  assert.equal(plugin.getOutputEmbedPath(), 'Reference/chart.svg');
  plugin.settings.outputPath = 'Reference/../../outside.svg';
  assert.equal(plugin.getOutputEmbedPath(), null);
  plugin.settings.outputPath = '/vault-neighbor/chart.svg';
  assert.equal(plugin.getOutputEmbedPath(), null);
  plugin.settings.outputPath = '/vault/Reference/chart.svg';
  assert.equal(plugin.getOutputEmbedPath(), 'Reference/chart.svg');
});
