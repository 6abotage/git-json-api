import simpleGit from "simple-git";
import type { SimpleGit } from "simple-git";
import fs from "fs";
import path from "path";

// FP-style helper functions
const initRepo = async (repoPath: string, uri: string): Promise<void> => {
  if (fs.existsSync(repoPath)) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
  await simpleGit().clone(uri, repoPath);
};

const getCommitHash = async (
  repoPath: string,
  version: string
): Promise<string> => {
  const git: SimpleGit = simpleGit(repoPath);
  const log = await git.log([version, "-n", "1"]);
  if (log.latest) {
    return log.latest.hash;
  }
  throw new Error("No commits found for the specified version");
};

const checkoutCommit = async (
  repoPath: string,
  commitHash: string
): Promise<void> => {
  const git: SimpleGit = simpleGit(repoPath);
  await git.checkout(commitHash);
};

const commitChanges = async (
  repoPath: string,
  message: string,
  author: string
): Promise<void> => {
  const git: SimpleGit = simpleGit(repoPath);
  await git.add(".");
  await git.commit(message, { "--author": author });
};

// OOP-style Repo class
class Repo {
  private uri: string;
  private repoPath: string;

  constructor(uri: string, repoPath: string) {
    this.uri = uri;
    this.repoPath = repoPath;
  }

  async init(): Promise<void> {
    await initRepo(this.repoPath, this.uri);
  }

  async getCommitHash(version: string): Promise<string> {
    return getCommitHash(this.repoPath, version);
  }

  async checkoutCommit(commitHash: string): Promise<void> {
    await checkoutCommit(this.repoPath, commitHash);
  }

  async commitChanges(message: string, author: string): Promise<void> {
    await commitChanges(this.repoPath, message, author);
  }
}

export default Repo;
