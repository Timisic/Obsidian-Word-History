import { Notice, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { buildWordHistory, countCountableText, countMarkdown, isCountablePath, renderChartSvg } from "./generator";
import { runPreflight, summarizePreflightFailure } from "./preflight";
import { WordHistorySettingTab } from "./settings";
import type { WordHistorySettings } from "./types";

export const DEFAULT_SETTINGS: WordHistorySettings = {
  outputPath: "Reference/chart.svg",
  updateMode: "manual",
  intervalDays: 3,
  lastRunAt: 0,
  lastSeenHead: "",
  lastRunStatus: "Never run.",
  lastRunError: "",
  lastGeneratedPath: "",
  lastWordsAdded: 0,
  lastTotalWords: 0,
};

export default class WordHistoryPlugin extends Plugin {
  settings: WordHistorySettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "generate-word-history-chart",
      name: "Generate word history chart",
      callback: () => this.runGenerator({ silent: false }),
    });

    this.addCommand({
      id: "check-word-history-git-changes",
      name: "Check Git changes and update word history",
      callback: () => this.maybeRunGitChangeUpdate({ silent: false }),
    });

    this.addSettingTab(new WordHistorySettingTab(this.app, this));

    this.registerInterval(window.setInterval(() => {
      this.maybeRunScheduledUpdate();
      this.maybeRunGitChangeUpdate({ silent: true });
    }, 60 * 60 * 1000));

    this.maybeRunScheduledUpdate();
    this.maybeRunGitChangeUpdate({ silent: true });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getVaultPath(): string {
    const adapter = this.app.vault.adapter;
    const localAdapter = adapter as typeof adapter & { getBasePath?: () => string };
    if (!localAdapter || typeof localAdapter.getBasePath !== "function") {
      throw new Error("Word History requires Obsidian desktop with a local file-system vault.");
    }
    return localAdapter.getBasePath();
  }

  getPluginRoot(): string {
    return path.join(this.getVaultPath(), this.app.vault.configDir || ".obsidian", "plugins", this.manifest.id);
  }

  getOutputPath(): string {
    const configuredPath = this.settings.outputPath || DEFAULT_SETTINGS.outputPath;
    return path.isAbsolute(configuredPath) ? configuredPath : path.join(this.getVaultPath(), configuredPath);
  }

  getOutputEmbedPath(): string {
    const configuredPath = this.settings.outputPath || DEFAULT_SETTINGS.outputPath;
    return path.isAbsolute(configuredPath) ? path.relative(this.getVaultPath(), configuredPath).replace(/\\/gu, "/") : configuredPath.replace(/\\/gu, "/");
  }

  getCachePath(): string {
    return path.join(this.getPluginRoot(), ".cache", "word-history-cache.json");
  }

  getCacheStatus(): string {
    const cachePath = this.getCachePath();
    if (!fs.existsSync(cachePath)) return "No cache yet.";
    const stats = fs.statSync(cachePath);
    return `Cache exists (${Math.max(stats.size, 0)} bytes, updated ${new Date(stats.mtimeMs).toLocaleString()}).`;
  }

  resetCache(): void {
    const cachePath = this.getCachePath();
    if (fs.existsSync(cachePath)) fs.rmSync(cachePath, { force: true });
    this.settings.lastRunStatus = "Cache reset. Generate again to rebuild from Git history.";
  }

  async getReadiness() {
    return runPreflight(this.getVaultPath(), this.getOutputPath());
  }

  async maybeRunScheduledUpdate() {
    if (this.settings.updateMode !== "interval") return;
    const intervalDays = Math.max(Number(this.settings.intervalDays) || DEFAULT_SETTINGS.intervalDays, 1);
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    if (Date.now() - Number(this.settings.lastRunAt || 0) < intervalMs) return;
    await this.runGenerator({ silent: true });
  }

  async maybeRunGitChangeUpdate({ silent }: { silent: boolean }) {
    if (this.settings.updateMode !== "git-changes") return;
    try {
      const readiness = await this.getReadiness();
      if (!readiness.ok || !readiness.headCommit || readiness.headCommit === this.settings.lastSeenHead) return;
      await this.runGenerator({ silent });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!silent) new Notice(`Word History Git check failed: ${message}`);
      console.error("Word History Git check failed", error);
    }
  }

  async runGenerator({ silent }: { silent: boolean }) {
    try {
      const readiness = await this.getReadiness();
      if (!readiness.ok) throw new Error(summarizePreflightFailure(readiness));
      const result = await buildWordHistory(this.getVaultPath(), this.getOutputPath(), this.getCachePath());
      this.settings.lastRunAt = Date.now();
      this.settings.lastSeenHead = result.headCommit;
      this.settings.lastGeneratedPath = result.chartSvgPath;
      this.settings.lastWordsAdded = result.wordsAddedSinceLastRun;
      this.settings.lastTotalWords = result.currentTotalWords;
      this.settings.lastRunError = "";
      this.settings.lastRunStatus = `Updated ${new Date(this.settings.lastRunAt).toLocaleString()}: +${result.wordsAddedSinceLastRun} words, ${result.currentTotalWords} total.`;
      await this.saveSettings();
      if (!silent) {
        new Notice(`Word History chart updated. +${result.wordsAddedSinceLastRun} words, ${result.currentTotalWords} total.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.settings.lastRunError = message;
      this.settings.lastRunStatus = `Failed ${new Date().toLocaleString()}: ${message}`;
      await this.saveSettings();
      if (!silent) new Notice(`Word History failed: ${message}`);
      console.error("Word History failed", error);
    }
  }
}

export const __test = {
  buildWordHistory,
  countMarkdown,
  countCountableText,
  isCountablePath,
  renderChartSvg,
  runPreflight,
};
