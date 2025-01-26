import simpleGit, { type SimpleGit, type GitConfigScope } from "simple-git";
import fs from "fs";
import path from "path";
import { Mutex } from "async-mutex";
import type { Cache } from "./cache";

class Repo {
  private uri: string;
  private repoPath: string;
  private mutex: Mutex;
  private git: SimpleGit;
  private cache: Cache;

  constructor(uri: string, repoPath: string, cache: Cache) {
    this.uri = uri;
    this.repoPath = repoPath;
    this.mutex = new Mutex();
    this.cache = cache;
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
        const cacheKey = `commit:${targetVersion}`;

        // Check cache first
        const cachedHash = await this.cache.get(cacheKey);
        if (cachedHash) return cachedHash;

        // Fetch latest changes from origin
        await this.git.fetch("origin");

        // Get latest commit from remote branch
        const log = await this.git.log([`origin/${targetVersion}`, "-n", "1"]);

        if (!log.latest) {
          throw new Error(`No commits found for '${targetVersion}'`);
        }

        // Update cache
        await this.cache.set(cacheKey, log.latest.hash);

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
