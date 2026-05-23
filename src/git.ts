import * as childProcess from "child_process";

export function gitText(repoPath: string, args: string[]): Promise<string> {
  return gitBuffer(repoPath, args).then((buffer) => buffer.toString("utf8"));
}

export function gitBuffer(repoPath: string, args: string[]): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    childProcess.execFile("git", ["-C", repoPath, ...args], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr && stderr.length ? stderr.toString("utf8") : error.message;
        reject(new Error(message.trim()));
        return;
      }
      resolve(stdout);
    });
  });
}

export function commandText(command: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    childProcess.execFile(command, args, { encoding: "utf8", maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).trim()));
        return;
      }
      resolve(stdout);
    });
  });
}
