import simpleGit from "simple-git";
import type { SimpleGit } from "simple-git";
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

  // Helper method to execute a function with the mutex lock
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.mutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  // Initialize the repository (clone if it doesn't exist)
  async init(): Promise<void> {
    return this.withLock(async () => {
      if (fs.existsSync(this.repoPath)) {
        fs.rmSync(this.repoPath, { recursive: true, force: true });
      }
      await simpleGit().clone(this.uri, this.repoPath);
      await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate a delay
    });
  }

  // Get the latest commit hash for a given version
  async getCommitHash(version: string): Promise<string> {
    return this.withLock(async () => {
      try {
        const log = await this.git.log([version, "-n", "1"]);
        if (log.latest) {
          await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate a delay
          return log.latest.hash;
        }
        throw new Error("No commits found for the specified version");
      } catch (err) {
        // Catch Git errors and throw a custom error
        throw new Error("No commits found for the specified version");
      }
    });
  }

  // Checkout a specific commit
  async checkoutCommit(commitHash: string): Promise<void> {
    return this.withLock(async () => {
      await this.git.checkout(commitHash);
    });
  }

  // Commit changes to the repository
  async commitChanges(
    filePath: string,
    content: string,
    message: string,
    author: string
  ): Promise<void> {
    return this.withLock(async () => {
      // Check if the file exists
      if (!fs.existsSync(filePath)) {
        throw new Error("File does not exist");
      }

      // Write the file (protected by the mutex)
      fs.writeFileSync(filePath, content);

      // Commit the changes (protected by the mutex)
      await this.git.add(".");
      await this.git.commit(message, { "--author": author });

      // Simulate a delay
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  }
}

export default Repo;
