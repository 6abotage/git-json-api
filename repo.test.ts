import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import Repo from "./repo";
import fs from "fs";
import path from "path";
import os from "os";
import simpleGit, { type SimpleGit } from "simple-git";
import { MemoryCache } from "./cache";

describe("Repo", () => {
  let repo: Repo;
  let testRepoPath: string;
  let clonedRepoPath: string;
  let testRepoUri: string;
  let testRepoGit: SimpleGit;
  let defaultBranch: string;

  beforeEach(async () => {
    testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "test-repo-"));
    clonedRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "cloned-repo-"));
    testRepoUri = `file://${testRepoPath}`;

    testRepoGit = simpleGit(testRepoPath);
    await testRepoGit.init();

    const headRef = await testRepoGit.raw(["symbolic-ref", "--short", "HEAD"]);
    defaultBranch = headRef.trim();

    await testRepoGit.addConfig("user.name", "Test User", true, "global");
    await testRepoGit.addConfig(
      "user.email",
      "test@example.com",
      true,
      "global"
    );

    fs.writeFileSync(path.join(testRepoPath, "file1.txt"), "Initial content");
    await testRepoGit.add(".");
    await testRepoGit.commit("Initial commit");

    repo = new Repo(testRepoUri, clonedRepoPath, new MemoryCache(60));
    await repo.init();
  });

  afterEach(() => {
    fs.rmSync(testRepoPath, { recursive: true, force: true });
    fs.rmSync(clonedRepoPath, { recursive: true, force: true });
  });

  test("should clone repository", async () => {
    expect(fs.existsSync(path.join(clonedRepoPath, "file1.txt"))).toBe(true);
  });

  test("should get commit hash for branch", async () => {
    const git = simpleGit(clonedRepoPath);
    const branch = (await git.branch()).current;
    const hash = await repo.getCommitHash(branch);
    expect(hash).toMatch(/^[a-f0-9]{40}$/);
  });

  test("should throw error for invalid branch", async () => {
    await expect(repo.getCommitHash("invalid-branch")).rejects.toThrow();
  });

  test("should checkout commit", async () => {
    const git = simpleGit(clonedRepoPath);
    const hash = (await git.log()).latest!.hash;
    await repo.checkoutCommit(hash);
    expect((await git.log()).latest?.hash).toBe(hash);
  });

  test("should commit changes", async () => {
    const filePath = path.join(clonedRepoPath, "new-file.txt");
    await repo.commitChanges(
      filePath,
      "Content",
      "Add file",
      "Author <a@test.com>"
    );
    const git = simpleGit(clonedRepoPath);
    expect((await git.log()).total).toBe(2);
  });

  test("should handle concurrent commits safely", async () => {
    const filePath = path.join(clonedRepoPath, "counter.txt");
    fs.writeFileSync(filePath, "0");

    await Promise.all([
      repo.commitChanges(filePath, "1", "Commit 1", "User <u@test.com>"),
      repo.commitChanges(filePath, "2", "Commit 2", "User <u@test.com>"),
      repo.commitChanges(filePath, "3", "Commit 3", "User <u@test.com>"),
    ]);

    const finalContent = fs.readFileSync(filePath, "utf-8");
    const git = simpleGit(clonedRepoPath);
    const commits = (await git.log()).all.map((c) => c.message);

    // Verify all commits were processed
    expect(commits).toContain("Commit 1");
    expect(commits).toContain("Commit 2");
    expect(commits).toContain("Commit 3");

    // Verify final state reflects last write wins due to mutex ordering
    expect(finalContent).toBe("3");
    expect((await git.log()).total).toBe(4); // Initial + 3 commits
  });

  test("should create directories for new files", async () => {
    const filePath = path.join(clonedRepoPath, "nested/dir/file.txt");
    await repo.commitChanges(
      filePath,
      "Content",
      "Add nested file",
      "User <u@test.com>"
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });
  describe("Caching", () => {
    test("should return cached commit hash", async () => {
      const cache = new MemoryCache(60);
      const repo = new Repo(testRepoUri, clonedRepoPath, cache);

      const hash1 = await repo.getCommitHash(defaultBranch); // Use dynamic branch
      const hash2 = await repo.getCommitHash(defaultBranch);

      expect(hash1).toBe(hash2);
    });

    test("should refresh cache after expiration", async () => {
      const cache = new MemoryCache(1);
      const repo = new Repo(testRepoUri, clonedRepoPath, cache);

      const originalHash = await repo.getCommitHash(defaultBranch); // Use dynamic branch

      fs.writeFileSync(path.join(testRepoPath, "file2.txt"), "New content");
      await testRepoGit.add(".");
      await testRepoGit.commit("New commit");

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const newHash = await repo.getCommitHash(defaultBranch); // Use dynamic branch

      expect(newHash).not.toBe(originalHash);
      expect(newHash.length).toBe(40);
    });
  });
});
