import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";

function runDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export async function openFile(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) throw new Error(`File does not exist: ${filePath}`);
  if (process.platform === "darwin") return runDetached("open", [filePath]);
  if (process.platform === "win32") return runDetached("cmd", ["/c", "start", "", filePath]);
  return runDetached("xdg-open", [filePath]);
}

export async function revealFile(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) throw new Error(`File does not exist: ${filePath}`);
  if (process.platform === "darwin") return runDetached("open", ["-R", filePath]);
  if (process.platform === "win32") return runDetached("explorer", ["/select,", filePath]);
  return runDetached("xdg-open", [path.dirname(filePath)]);
}

export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("Clipboard API is not available in this Obsidian session.");
}
