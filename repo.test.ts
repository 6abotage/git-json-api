import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import Repo from "./repo";
import fs from "fs";
import path from "path";
import os from "os";
import simpleGit, { type SimpleGit } from "simple-git";

describe("Repo", () => {
  let repo: Repo;
  let testRepoPath: string;
  let clonedRepoPath: string;
  let testRepoUri: string;

  beforeEach(async () => {
    testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "test-repo-"));
    clonedRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "cloned-repo-"));
    testRepoUri = `file://${testRepoPath}`;

    const git = simpleGit(testRepoPath);
    await git.init();
    await git.addConfig("user.name", "Test User", true, "global");
    await git.addConfig("user.email", "test@example.com", true, "global");

    fs.writeFileSync(path.join(testRepoPath, "file1.txt"), "Initial content");
    await git.add(".");
    await git.commit("Initial commit");

    repo = new Repo(testRepoUri, clonedRepoPath);
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

    const modifyCounter = async (value: string) => {
      const current = fs.readFileSync(filePath, "utf-8");
      await repo.commitChanges(
        filePath,
        value,
        `Set to ${value}`,
        "User <u@test.com>"
      );
    };

    await Promise.all([
      modifyCounter("1"),
      modifyCounter("2"),
      modifyCounter("3"),
    ]);

    const finalContent = fs.readFileSync(filePath, "utf-8");
    const git = simpleGit(clonedRepoPath);
    const commits = (await git.log()).all.map((c) => c.message);

    // Verify all commits were processed
    expect(commits).toContain("Set to 1");
    expect(commits).toContain("Set to 2");
    expect(commits).toContain("Set to 3");

    // Verify final state is one of the possible values
    expect(["1", "2", "3"]).toContain(finalContent);
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
});
