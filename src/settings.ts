import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type WordHistoryPlugin from "./main";
import { copyText, openFile, revealFile } from "./platformActions";
import type { WordHistorySettings } from "./types";

export class WordHistorySettingTab extends PluginSettingTab {
  plugin: WordHistoryPlugin;

  constructor(app: App, plugin: WordHistoryPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Word History" });
    containerEl.createEl("p", {
      text: "Generate a local writing-growth SVG from a Git-backed Obsidian vault. Runtime needs only Obsidian desktop and system git.",
    });

    this.renderStatus(containerEl);
    this.renderGeneratorControls(containerEl);
    this.renderSettings(containerEl);
  }

  private renderStatus(containerEl: HTMLElement) {
    containerEl.createEl("h3", { text: "Readiness" });
    const statusEl = containerEl.createDiv({ cls: "word-history-status" });
    statusEl.createEl("p", { text: this.plugin.settings.lastRunStatus || "Never run." });
    statusEl.createEl("p", { text: this.plugin.getCacheStatus() });

    new Setting(containerEl)
      .setName("Refresh status")
      .setDesc("Check git, vault history, output path, cache, and current HEAD before generating.")
      .addButton((button) => button
        .setButtonText("Refresh")
        .onClick(async () => {
          await this.showReadinessNotice();
          this.display();
        }));
  }

  private renderGeneratorControls(containerEl: HTMLElement) {
    containerEl.createEl("h3", { text: "Generate and use the chart" });

    new Setting(containerEl)
      .setName("Generate now")
      .setDesc("Run the chart generator once after preflight checks.")
      .addButton((button) => button
        .setButtonText("Generate")
        .setCta()
        .onClick(async () => {
          await this.plugin.runGenerator({ silent: false });
          this.display();
        }));

    new Setting(containerEl)
      .setName("Open SVG")
      .setDesc("Open the latest chart file with your system default app.")
      .addButton((button) => button
        .setButtonText("Open")
        .onClick(async () => this.runAction("Open SVG", () => openFile(this.plugin.getOutputPath()))));

    new Setting(containerEl)
      .setName("Copy Obsidian embed")
      .setDesc("Copy the note embed syntax for the output path.")
      .addButton((button) => button
        .setButtonText("Copy ![[...]]")
        .onClick(async () => this.runAction("Copy embed", () => copyText(`![[${this.plugin.getOutputEmbedPath()}]]`))));

    new Setting(containerEl)
      .setName("Reveal output file")
      .setDesc("Show the generated SVG in Finder or your file manager.")
      .addButton((button) => button
        .setButtonText("Reveal")
        .onClick(async () => this.runAction("Reveal output", () => revealFile(this.plugin.getOutputPath()))));

    new Setting(containerEl)
      .setName("Reset cache")
      .setDesc("Delete the incremental cache. The next generation will replay full Git history.")
      .addButton((button) => button
        .setWarning()
        .setButtonText("Reset cache")
        .onClick(async () => {
          this.plugin.resetCache();
          await this.plugin.saveSettings();
          new Notice("Word History cache reset.");
          this.display();
        }));
  }

  private renderSettings(containerEl: HTMLElement) {
    containerEl.createEl("h3", { text: "Settings" });

    new Setting(containerEl)
      .setName("Output SVG path")
      .setDesc("Absolute path or vault-relative path, for example Reference/chart.svg.")
      .addText((text) => text
        .setPlaceholder("Reference/chart.svg")
        .setValue(this.plugin.settings.outputPath)
        .onChange(async (value) => {
          this.plugin.settings.outputPath = value.trim() || "Reference/chart.svg";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Update mode")
      .setDesc("Manual, every N days while Obsidian is open, or when the Git HEAD changes.")
      .addDropdown((dropdown) => dropdown
        .addOption("manual", "Manual")
        .addOption("interval", "Every N days")
        .addOption("git-changes", "On Git changes")
        .setValue(this.plugin.settings.updateMode)
        .onChange(async (value) => {
          this.plugin.settings.updateMode = value as WordHistorySettings["updateMode"];
          await this.plugin.saveSettings();
          if (value === "git-changes") await this.plugin.maybeRunGitChangeUpdate({ silent: false });
        }));

    new Setting(containerEl)
      .setName("Interval days")
      .setDesc("Used only when update mode is Every N days.")
      .addText((text) => text
        .setPlaceholder("3")
        .setValue(String(this.plugin.settings.intervalDays))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.intervalDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
          await this.plugin.saveSettings();
        }));
  }

  private async showReadinessNotice() {
    try {
      const readiness = await this.plugin.getReadiness();
      const details = readiness.checks.map((check) => `${check.ok ? "✓" : "✗"} ${check.label}: ${check.detail}`).join("\n");
      new Notice(details, 12000);
    } catch (error) {
      new Notice(`Word History status failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async runAction(label: string, action: () => Promise<void>) {
    try {
      await action();
      new Notice(`${label} complete.`);
    } catch (error) {
      new Notice(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
