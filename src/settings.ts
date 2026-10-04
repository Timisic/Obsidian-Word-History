import { ButtonComponent, Notice, PluginSettingTab, Setting, TFile, getLanguage, type App } from "obsidian";
import * as fs from "fs";
import { validateChartOptions } from "./chart";
import type WordHistoryPlugin from "./main";
import { copyText, openFile, revealFile } from "./platformActions";

const labels = {
  en: { generate: "Generate", generating: "Generating…", view: "View chart", copy: "Copy embed", copied: "Copied.", intervalHelp: "Runs while Obsidian is open.", gitHelp: "Checks Git commits at startup and hourly.", update: "Auto update", manual: "Manual", interval: "Every N days", git: "After Git commits", days: "Interval days", positive: "Enter a positive whole number.", path: "Save to", pathHelp: "Vault-relative or absolute SVG path.", options: "Chart options", month: "Milestone month", monthHelp: "YYYY-MM, or leave empty.", monthError: "Use YYYY-MM, such as 2025-07, or leave empty.", zone: "Time zone", zoneError: "Use a valid IANA time zone, such as UTC or Asia/Shanghai.", diagnostics: "Diagnostics", check: "Refresh / check", reveal: "Reveal file", reset: "Reset cache", resetHelp: "Cache cleared. The next generation will replay Git history.", pending: "Run a check to inspect Git and output access.", checking: "Checking…", never: "No chart generated yet.", running: "Generating local chart…", total: "total words", failed: "Generation failed", outside: "Embedding requires a save location inside this vault.", noCache: "No cache yet.", cache: "Cache", noMonth: "No milestone" },
  zh: { generate: "立即生成", generating: "正在生成…", view: "查看图表", copy: "复制嵌入", copied: "已复制。", intervalHelp: "仅在 Obsidian 打开时运行。", gitHelp: "启动时及每小时检查 Git 提交。", update: "自动更新", manual: "手动", interval: "每隔几天", git: "Git 提交后", days: "间隔天数", positive: "请输入正整数。", path: "保存位置", pathHelp: "库内路径或绝对路径。", options: "图表选项", month: "里程碑月份", monthHelp: "YYYY-MM，可留空。", monthError: "请使用 YYYY-MM，例如 2025-07，或留空。", zone: "时区", zoneError: "请输入有效时区，例如 UTC 或 Asia/Shanghai。", diagnostics: "诊断与维护", check: "刷新检查", reveal: "显示文件", reset: "重置缓存", resetHelp: "缓存已清除，下次生成将重新读取 Git 历史。", pending: "点击检查，查看 Git 与保存位置是否可用。", checking: "正在检查…", never: "尚未生成图表。", running: "正在生成本地图表…", total: "字", failed: "生成失败", outside: "保存到此库内后才能复制嵌入。", noCache: "暂无缓存。", cache: "缓存", noMonth: "无里程碑" },
};

export class WordHistorySettingTab extends PluginSettingTab {
  private readonly words = labels[typeof getLanguage === "function" && getLanguage().startsWith("zh") ? "zh" : "en"];
  private validationId = 0;
  private statusEl: HTMLElement | null = null;
  private cacheEl: HTMLElement | null = null;
  private embedHelpEl: HTMLElement | null = null;
  private generateButton: ButtonComponent | null = null;
  private viewButton: ButtonComponent | null = null;
  private copyButton: ButtonComponent | null = null;
  private resetButton: ButtonComponent | null = null;

  constructor(app: App, readonly plugin: WordHistoryPlugin) { super(app, plugin); }

  hide() {
    this.statusEl = this.cacheEl = this.embedHelpEl = null;
    this.generateButton = this.viewButton = this.copyButton = this.resetButton = null;
  }

  display() {
    this.hide();
    const el = this.containerEl;
    const w = this.words;
    el.empty();
    el.createEl("h2", { text: "Word History" });
    this.statusEl = el.createEl("p", { attr: { role: "status", "aria-live": "polite" } });
    const toolbar = el.createDiv();
    Object.assign(toolbar.style, { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" });
    this.generateButton = new ButtonComponent(toolbar).setButtonText(w.generate).setCta().onClick(() => this.plugin.runGenerator({ silent: false }));
    this.viewButton = new ButtonComponent(toolbar).setButtonText(w.view).onClick(() => this.runAction(async () => {
      const embed = this.plugin.getOutputEmbedPath();
      const file = embed ? this.app.vault.getAbstractFileByPath(embed) : null;
      if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
      else await openFile(this.plugin.getOutputPath());
    }));
    this.copyButton = new ButtonComponent(toolbar).setButtonText(w.copy).onClick(() => this.runAction(async () => {
      const embed = this.plugin.getOutputEmbedPath();
      if (!embed) throw new Error(w.outside);
      await copyText(`![[${embed}]]`);
      new Notice(w.copied);
    }));
    this.embedHelpEl = el.createEl("p", { text: w.outside });

    const interval = new Setting(el).setName(w.days).addText(text => {
      text.setValue(String(this.plugin.settings.intervalDays)).onChange(async value => {
        const parsed = Number(value);
        if (!/^\d+$/u.test(value.trim()) || !Number.isSafeInteger(parsed) || parsed <= 0) {
          this.invalid(text.inputEl, w.positive); return;
        }
        this.invalid(text.inputEl, "");
        this.plugin.settings.intervalDays = parsed;
        await this.plugin.saveSettings();
      });
    });
    const update = new Setting(el).setName(w.update).addDropdown(dropdown => dropdown
      .addOption("manual", w.manual).addOption("interval", w.interval).addOption("git-changes", w.git)
      .setValue(this.plugin.settings.updateMode).onChange(async value => {
        if (value !== "manual" && value !== "interval" && value !== "git-changes") return;
        this.plugin.settings.updateMode = value;
        interval.settingEl.style.display = value === "interval" ? "" : "none";
        update.setDesc(value === "interval" ? w.intervalHelp : value === "git-changes" ? w.gitHelp : "");
        await this.plugin.saveSettings();
        if (value === "git-changes") await this.plugin.maybeRunGitChangeUpdate({ silent: false });
      }));
    el.insertBefore(update.settingEl, interval.settingEl);
    interval.settingEl.style.display = this.plugin.settings.updateMode === "interval" ? "" : "none";
    update.setDesc(this.plugin.settings.updateMode === "interval" ? w.intervalHelp : this.plugin.settings.updateMode === "git-changes" ? w.gitHelp : "");
    new Setting(el).setName(w.path).setDesc(w.pathHelp).addText(text => text
      .setPlaceholder("Reference/chart.svg").setValue(this.plugin.settings.outputPath).onChange(async value => {
        this.plugin.settings.outputPath = value.trim() || "Reference/chart.svg";
        this.refreshRunState();
        await this.plugin.saveSettings();
      }));

    const options = el.createEl("details");
    options.style.marginTop = "16px";
    const summary = options.createEl("summary");
    const updateSummary = () => { summary.textContent = `${w.options} · ${this.plugin.settings.milestoneMonth || w.noMonth} · ${this.plugin.settings.timeZone}`; };
    updateSummary();
    new Setting(options).setName(w.month).setDesc(w.monthHelp).addText(text => {
      text.setPlaceholder("YYYY-MM").setValue(this.plugin.settings.milestoneMonth).onChange(async value => {
        const milestoneMonth = value.trim();
        try { validateChartOptions({ ...this.plugin.settings, milestoneMonth }); }
        catch { this.invalid(text.inputEl, w.monthError); return; }
        this.invalid(text.inputEl, "");
        this.plugin.settings.milestoneMonth = milestoneMonth;
        updateSummary();
        await this.plugin.saveSettings();
      });
    });
    new Setting(options).setName(w.zone).addText(text => {
      text.setPlaceholder("UTC").setValue(this.plugin.settings.timeZone).onChange(async value => {
        const timeZone = value.trim() || "UTC";
        try { validateChartOptions({ ...this.plugin.settings, timeZone }); }
        catch { this.invalid(text.inputEl, w.zoneError); return; }
        this.invalid(text.inputEl, "");
        this.plugin.settings.timeZone = timeZone;
        updateSummary();
        await this.plugin.saveSettings();
      });
    });
    const diagnostics = el.createEl("details");
    diagnostics.style.marginTop = "16px";
    diagnostics.createEl("summary", { text: w.diagnostics });
    const checks = diagnostics.createEl("p", { text: w.pending, attr: { role: "status", "aria-live": "polite" } });
    this.cacheEl = diagnostics.createEl("p");
    const maintenance = diagnostics.createDiv();
    Object.assign(maintenance.style, { display: "flex", flexWrap: "wrap", gap: "8px" });
    new ButtonComponent(maintenance).setButtonText(w.check).onClick(async () => {
      checks.textContent = w.checking;
      try {
        const readiness = await this.plugin.getReadiness();
        checks.empty();
        for (const check of readiness.checks) checks.createEl("div", { text: `${check.ok ? "✓" : "✗"} ${check.label}: ${check.detail}` });
      } catch (error) { checks.textContent = this.errorMessage(error); }
      this.refreshRunState();
    });
    new ButtonComponent(maintenance).setButtonText(w.reveal).onClick(() => this.runAction(() => revealFile(this.plugin.getOutputPath())));
    this.resetButton = new ButtonComponent(maintenance).setButtonText(w.reset).setWarning().onClick(async () => {
      try {
        this.plugin.resetCache();
        await this.plugin.saveSettings();
        checks.textContent = w.resetHelp;
      } catch (error) { checks.textContent = this.errorMessage(error); }
      this.refreshRunState();
    });
    this.refreshRunState();
  }

  refreshRunState() {
    const w = this.words;
    const s = this.plugin.settings;
    const running = this.plugin.isGenerating;
    if (this.statusEl) this.statusEl.textContent = running ? w.running : s.lastRunError ? `${w.failed}: ${s.lastRunError}` : s.lastRunAt ? `${new Date(s.lastRunAt).toLocaleString(undefined, { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ${s.lastTotalWords.toLocaleString()} ${w.total}` : w.never;
    this.generateButton?.setDisabled(running).setButtonText(running ? w.generating : w.generate);
    this.resetButton?.setDisabled(running);
    let exists = false;
    let embed: string | null = null;
    try {
      exists = fs.existsSync(this.plugin.getOutputPath());
      embed = this.plugin.getOutputEmbedPath();
      if (this.cacheEl) this.cacheEl.textContent = `${w.cache}: ${this.plugin.getCacheStatus() === "No cache yet." ? w.noCache : this.plugin.getCacheStatus()}`;
    } catch (error) { if (this.cacheEl) this.cacheEl.textContent = this.errorMessage(error); }
    this.viewButton?.setDisabled(!exists);
    this.copyButton?.setDisabled(!exists || !embed);
    if (this.embedHelpEl) this.embedHelpEl.hidden = embed !== null;
  }

  private invalid(input: HTMLInputElement, message: string) {
    input.setCustomValidity(message);
    const errorId = input.getAttribute("aria-errormessage");
    let errorEl = errorId ? input.ownerDocument.getElementById(errorId) : null;
    if (!message) {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-errormessage");
      errorEl?.remove();
      return;
    }
    input.setAttribute("aria-invalid", "true");
    if (!errorEl) {
      errorEl = input.ownerDocument.createElement("div");
      errorEl.id = `word-history-validation-${++this.validationId}`;
      errorEl.className = "setting-item-description";
      errorEl.style.color = "var(--text-error)";
      errorEl.setAttribute("role", "alert");
      const info = input.closest(".setting-item")?.querySelector(".setting-item-info");
      (info || input.parentElement)?.append(errorEl);
      input.setAttribute("aria-errormessage", errorEl.id);
    }
    errorEl.textContent = message;
  }
  private errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
  private async runAction(action: () => Promise<void>) {
    try { await action(); }
    catch (error) { new Notice(this.errorMessage(error)); }
  }
}
