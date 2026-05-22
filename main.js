const { Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const DEFAULT_SETTINGS = {
  outputPath: "Reference/chart.svg",
  updateMode: "manual",
  intervalDays: 3,
  lastRunAt: 0,
};

module.exports = class WordHistoryPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "generate-word-history-chart",
      name: "Generate word history chart",
      callback: () => this.runGenerator({ silent: false }),
    });

    this.addCommand({
      id: "install-word-history-git-hooks",
      name: "Install word history Git hooks",
      callback: () => this.installGitHooks({ silent: false }),
    });

    this.addSettingTab(new WordHistorySettingTab(this.app, this));

    this.registerInterval(
      window.setInterval(() => {
        this.maybeRunIntervalUpdate();
      }, 60 * 60 * 1000)
    );

    this.maybeRunIntervalUpdate();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getVaultPath() {
    const adapter = this.app.vault.adapter;
    if (!adapter || typeof adapter.getBasePath !== "function") {
      throw new Error("Word History requires Obsidian desktop with a local file-system vault.");
    }
    return adapter.getBasePath();
  }

  getPluginRoot() {
    return path.join(this.getVaultPath(), this.app.vault.configDir || ".obsidian", "plugins", this.manifest.id);
  }

  getOutputPath() {
    const configuredPath = this.settings.outputPath || DEFAULT_SETTINGS.outputPath;
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(this.getVaultPath(), configuredPath);
  }

  getCachePath() {
    return path.join(this.getPluginRoot(), ".cache", "word-history-cache.json");
  }

  getGeneratorScriptPath() {
    return path.join(this.getPluginRoot(), "scripts", "generate_chart.sh");
  }

  async maybeRunIntervalUpdate() {
    if (this.settings.updateMode !== "interval") {
      return;
    }
    const intervalDays = Math.max(Number(this.settings.intervalDays) || DEFAULT_SETTINGS.intervalDays, 1);
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    if (Date.now() - Number(this.settings.lastRunAt || 0) < intervalMs) {
      return;
    }
    await this.runGenerator({ silent: true });
  }

  async runGenerator({ silent }) {
    try {
      const vaultPath = this.getVaultPath();
      const outputPath = this.getOutputPath();
      const cachePath = this.getCachePath();
      const scriptPath = this.getGeneratorScriptPath();

      await runFile(scriptPath, [vaultPath, outputPath, cachePath], {
        cwd: this.getPluginRoot(),
        env: process.env,
      });

      this.settings.lastRunAt = Date.now();
      await this.saveSettings();
      if (!silent) {
        new Notice("Word History chart updated.");
      }
    } catch (error) {
      if (!silent) {
        new Notice(`Word History failed: ${error.message}`);
      }
      console.error("Word History failed", error);
    }
  }

  async installGitHooks({ silent }) {
    try {
      const vaultPath = this.getVaultPath();
      const gitHooksDir = path.join(vaultPath, ".git", "hooks");
      if (!fs.existsSync(gitHooksDir)) {
        throw new Error("Vault is not a Git repository or .git/hooks is missing.");
      }

      this.installHook(path.join(gitHooksDir, "post-commit"));
      this.installHook(path.join(gitHooksDir, "pre-push"));

      if (!silent) {
        new Notice("Word History Git hooks installed.");
      }
    } catch (error) {
      if (!silent) {
        new Notice(`Could not install Git hooks: ${error.message}`);
      }
      console.error("Word History hook install failed", error);
    }
  }

  installHook(hookPath) {
    const existing = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, "utf8") : "#!/usr/bin/env bash\n";
    if (existing.trim() === "") {
      fs.writeFileSync(hookPath, `#!/usr/bin/env bash\n\n${this.buildHookBlock()}`, { mode: 0o755 });
      fs.chmodSync(hookPath, 0o755);
      return;
    }
    const firstLine = existing.split(/\r?\n/, 1)[0];
    if (firstLine.startsWith("#!") && !/\b(?:bash|sh|zsh)\b/.test(firstLine)) {
      throw new Error(`${path.basename(hookPath)} already exists and is not a shell hook.`);
    }
    const withoutOldBlock = existing.replace(/\n?# BEGIN Word History[\s\S]*?# END Word History\n?/m, "\n");
    fs.writeFileSync(hookPath, `${withoutOldBlock.trimEnd()}\n\n${this.buildHookBlock()}`, { mode: 0o755 });
    fs.chmodSync(hookPath, 0o755);
  }

  buildHookBlock() {
    const scriptPath = shellQuote(this.getGeneratorScriptPath());
    const vaultPath = shellQuote(this.getVaultPath());
    const outputPath = shellQuote(this.getOutputPath());
    const cachePath = shellQuote(this.getCachePath());
    return `# BEGIN Word History
${scriptPath} ${vaultPath} ${outputPath} ${cachePath} >/dev/null 2>&1 &
# END Word History
`;
  }
};

class WordHistorySettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Word History" });

    new Setting(containerEl)
      .setName("Output SVG path")
      .setDesc("Absolute path or vault-relative path, for example Reference/chart.svg.")
      .addText((text) =>
        text
          .setPlaceholder("Reference/chart.svg")
          .setValue(this.plugin.settings.outputPath)
          .onChange(async (value) => {
            this.plugin.settings.outputPath = value.trim() || DEFAULT_SETTINGS.outputPath;
            await this.plugin.saveSettings();
            if (this.plugin.settings.updateMode === "git-hooks") {
              await this.plugin.installGitHooks({ silent: true });
            }
          })
      );

    new Setting(containerEl)
      .setName("Update mode")
      .setDesc("Manual, every N days while Obsidian is open, or Git hooks on commit/push.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("manual", "Manual")
          .addOption("interval", "Every N days")
          .addOption("git-hooks", "On Git commit/push")
          .setValue(this.plugin.settings.updateMode)
          .onChange(async (value) => {
            this.plugin.settings.updateMode = value;
            await this.plugin.saveSettings();
            if (value === "git-hooks") {
              await this.plugin.installGitHooks({ silent: false });
            }
          })
      );

    new Setting(containerEl)
      .setName("Interval days")
      .setDesc("Used only when update mode is Every N days.")
      .addText((text) =>
        text
          .setPlaceholder("3")
          .setValue(String(this.plugin.settings.intervalDays))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            this.plugin.settings.intervalDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Generate now")
      .setDesc("Run the chart generator once.")
      .addButton((button) =>
        button
          .setButtonText("Generate")
          .setCta()
          .onClick(() => this.plugin.runGenerator({ silent: false }))
      );

    new Setting(containerEl)
      .setName("Install Git hooks")
      .setDesc("Repair or reinstall the silent post-commit and pre-push hooks.")
      .addButton((button) =>
        button
          .setButtonText("Install hooks")
          .onClick(() => this.plugin.installGitHooks({ silent: false }))
      );
  }
}

function runFile(file, args, options) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
