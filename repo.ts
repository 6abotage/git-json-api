import simpleGit, { type SimpleGit, type GitConfigScope } from "simple-git";
import fs from "fs";
import path from "path";
import { Mutex } from "async-mutex";

class Repo {
  private uri: string;
  private repoPath: string;
  private mutex: Mutex;
  private git: SimpleGit;

  constructor(uri: string, repoPath: string) {
    this.uri = uri;
    this.repoPath = repoPath;
    this.mutex = new Mutex();
    this.git = simpleGit(repoPath);
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.mutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async init(): Promise<void> {
    return this.withLock(async () => {
      fs.rmSync(this.repoPath, { recursive: true, force: true });
      await simpleGit().clone(this.uri, this.repoPath);
      this.git = simpleGit(this.repoPath); // Reinitialize git instance
    });
  }

  async getCommitHash(version?: string): Promise<string> {
    return this.withLock(async () => {
      try {
        const branchSummary = await this.git.branch();
        const targetVersion = version || branchSummary.current;
        const log = await this.git.log([targetVersion, "-n", "1"]);

        if (!log.latest) {
          throw new Error(`No commits found for '${targetVersion}'`);
        }

        return log.latest.hash;
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Unknown error occurred"
        );
      }
    });
  }

  async checkoutCommit(commitHash: string): Promise<void> {
    return this.withLock(async () => {
      await this.git.checkout(commitHash);
    });
  }

  async commitChanges(
    filePath: string,
    content: string,
    message: string,
    author: string
  ): Promise<void> {
    return this.withLock(async () => {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content);
      await this.git.add(".");
      await this.git.commit(message, { "--author": author });
    });
  }
}

export default Repo;
