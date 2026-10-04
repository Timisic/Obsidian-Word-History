import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const stub = `
HTMLElement.prototype.empty = function() { this.replaceChildren(); };
HTMLElement.prototype.createEl = function(tag, options = {}) { const el = document.createElement(tag); if (options.text) el.textContent = options.text; for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, value); this.append(el); return el; };
HTMLElement.prototype.createDiv = function() { return this.createEl('div'); };
export function getLanguage() { return 'zh'; }
export class Notice { constructor(message) { window.notices.push(message); } }
export class TFile {}
export class PluginSettingTab { constructor(app) { this.app = app; this.containerEl = document.getElementById('settings'); } }
export class ButtonComponent { constructor(parent) { this.buttonEl = parent.createEl('button'); } setButtonText(text) { this.buttonEl.textContent = text; return this; } setDisabled(value) { this.buttonEl.disabled = value; return this; } setCta() { return this; } setWarning() { return this; } onClick(fn) { this.buttonEl.onclick = fn; return this; } }
export class Setting { constructor(parent) { this.settingEl = parent.createEl('div'); this.settingEl.className = 'setting-item'; this.name = this.settingEl.createEl('label'); this.desc = this.settingEl.createEl('small'); } setName(text) { this.name.textContent = text; return this; } setDesc(text) { this.desc.textContent = text; return this; } addText(fn) { const input = this.settingEl.createEl('input'); const control = { inputEl: input, setPlaceholder(value) { input.placeholder = value; return this; }, setValue(value) { input.value = value; return this; }, onChange(fn) { input.oninput = () => fn(input.value); return this; } }; fn(control); return this; } addDropdown(fn) { const select = this.settingEl.createEl('select'); const control = { addOption(value, text) { const option = select.createEl('option', { text }); option.value = value; return this; }, setValue(value) { select.value = value; return this; }, onChange(fn) { select.onchange = () => fn(select.value); return this; } }; fn(control); return this; } }
`;

test('native settings preserve disclosures and inputs while busy, validate edits and disable external embeds', async () => {
  const result = await build({ entryPoints: ['src/settings.ts'], bundle: true, write: false, format: 'iife', globalName: 'SettingsModule', plugins: [{ name: 'stubs', setup(builder) {
    builder.onResolve({ filter: /^(obsidian|fs)$/ }, args => ({ path: args.path, namespace: 'stub' }));
    builder.onResolve({ filter: /platformActions$/ }, () => ({ path: 'actions', namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: args.path === 'obsidian' ? stub : args.path === 'fs' ? 'export const existsSync = () => true;' : 'export const copyText = async () => {}; export const openFile = async () => {}; export const revealFile = async () => {};', loader: 'js' }));
  } }] });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<style>.setting-item { display:flex; }</style><div id="settings"></div>');
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.evaluate(() => {
      window.notices = [];
      window.plugin = { settings: { updateMode: 'manual', intervalDays: 3, outputPath: 'Reference/chart.svg', milestoneMonth: '', timeZone: 'UTC', lastRunAt: 0, lastRunError: '' }, isGenerating: false, saveSettings: async () => {}, getOutputPath: () => '/vault/Reference/chart.svg', getOutputEmbedPath: () => window.plugin.settings.outputPath.includes('..') ? null : 'Reference/chart.svg', getCacheStatus: () => 'No cache yet.', getReadiness: async () => ({ checks: [{ ok: true, label: 'Git', detail: 'available' }] }), resetCache: () => {}, runGenerator: async () => { window.plugin.isGenerating = true; window.tab.refreshRunState(); }, maybeRunGitChangeUpdate: async () => {} };
      window.tab = new SettingsModule.WordHistorySettingTab({ vault: {}, workspace: {} }, window.plugin);
      window.tab.display();
    });
    const row = text => page.locator('.setting-item').filter({ has: page.locator('label', { hasText: text }) });
    assert.equal(await row('间隔天数').isVisible(), false);
    await page.locator('select').selectOption('interval');
    assert.equal(await row('间隔天数').isVisible(), true);
    await row('间隔天数').locator('input').fill('1.5');
    assert.equal(await page.evaluate(() => plugin.settings.intervalDays), 3);
    assert.equal(await row('间隔天数').locator('input').evaluate(el => el.checkValidity()), false);
    await row('间隔天数').locator('input').fill('7');
    assert.equal(await page.evaluate(() => plugin.settings.intervalDays), 7);
    await page.locator('summary').first().click();
    await row('里程碑月份').locator('input').fill('invalid');
    assert.equal(await page.evaluate(() => plugin.settings.milestoneMonth), '');
    await row('时区').locator('input').evaluate(el => { el.value = 'invalid/zone'; el.dispatchEvent(new Event('input')); });
    assert.equal(await page.evaluate(() => plugin.settings.timeZone), 'UTC');
    await page.getByRole('button', { name: '立即生成' }).click();
    assert.equal(await page.getByRole('button', { name: '正在生成…' }).isDisabled(), true);
    assert.equal(await row('里程碑月份').locator('input').inputValue(), 'invalid');
    assert.equal(await page.locator('details').first().evaluate(el => el.open), true);
    await row('保存位置').locator('input').fill('../outside.svg');
    assert.equal(await page.getByRole('button', { name: '复制嵌入' }).isDisabled(), true);
    assert.equal(await page.getByText('保存到此库内后才能复制嵌入。').isVisible(), true);
    await page.evaluate(() => { tab.display(); });
    assert.equal(await page.getByRole('button', { name: '正在生成…' }).isDisabled(), true);
    await page.locator('summary').last().click();
    assert.equal(await page.getByRole('button', { name: '重置缓存' }).isDisabled(), true);
    await page.evaluate(() => { plugin.isGenerating = false; tab.refreshRunState(); });
    await page.getByRole('button', { name: '重置缓存' }).click();
    assert.equal(await page.getByText('缓存已清除，下次生成将重新读取 Git 历史。').isVisible(), true);
    await page.getByRole('button', { name: '刷新检查' }).click();
    assert.equal(await page.getByText('✓ Git: available').isVisible(), true);
    assert.deepEqual(await page.evaluate(() => notices), []);
  } finally { await browser.close(); }
});
