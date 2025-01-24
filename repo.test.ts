import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import Repo from "./repo";
import fs from "fs";
import path from "path";
import os from "os";
import simpleGit from "simple-git";
import type { SimpleGit } from "simple-git";

describe("Repo", () => {
  let repo: Repo;
  let testRepoPath: string;
  let clonedRepoPath: string;
  let testRepoUri: string;

  beforeEach(async () => {
    testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "my-test-repo-"));
    clonedRepoPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "my-test-cloned-repo-")
    );
    testRepoUri = `file://${testRepoPath}`;

    const git: SimpleGit = simpleGit(testRepoPath);
    await git.init();
    fs.writeFileSync(path.join(testRepoPath, "file1.txt"), "Hello, World!");
    await git.add(".");
    await git.commit("Initial commit");
    fs.writeFileSync(path.join(testRepoPath, "file1.txt"), "Another change");
    await git.add(".");
    await git.commit("Second commit");

    repo = new Repo(testRepoUri, clonedRepoPath);
  });

  afterEach(() => {
    if (fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
    if (fs.existsSync(clonedRepoPath)) {
      fs.rmSync(clonedRepoPath, { recursive: true, force: true });
    }
  });

  test("init should clone the repository", async () => {
    await repo.init();
    expect(fs.existsSync(clonedRepoPath)).toBe(true);
    expect(fs.existsSync(path.join(clonedRepoPath, "file1.txt"))).toBe(true);
  });

  test("getCommitHash should return the latest commit hash", async () => {
    await repo.init();
    const commitHash: string = await repo.getCommitHash("main");
    expect(commitHash).toBeString();
    expect(commitHash.length).toBe(40);
  });

  test("checkoutCommit should checkout a specific commit", async () => {
    await repo.init();
    const commitHash: string = await repo.getCommitHash("main");
    await repo.checkoutCommit(commitHash);

    const git: SimpleGit = simpleGit(clonedRepoPath);
    const log = await git.log();
    expect(log.latest?.hash).toBe(commitHash);
  });

  test("commitChanges should create a new commit", async () => {
    await repo.init();
    const newFilePath: string = path.join(clonedRepoPath, "file2.txt");
    fs.writeFileSync(newFilePath, "New file content");
    await repo.commitChanges("Add file2.txt", "Test User <test@example.com>");

    const git: SimpleGit = simpleGit(clonedRepoPath);
    const log = await git.log();
    expect(log.latest?.message).toBe("Add file2.txt");
  });
});
