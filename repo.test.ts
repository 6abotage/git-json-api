import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import Repo from "./repo";
import fs from "fs";
import path from "path";
import os from "os";
import simpleGit from "simple-git";
import type { SimpleGit } from "simple-git";
import { GitConfigScope } from "simple-git";

describe("Repo with Mutex", () => {
  let repo: Repo;
  let testRepoPath: string;
  let clonedRepoPath: string;
  let testRepoUri: string;

  beforeEach(async () => {
    // Create a temporary directory for the test repository
    testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "my-test-repo-"));
    clonedRepoPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "my-test-cloned-repo-")
    );
    testRepoUri = `file://${testRepoPath}`;

    // Initialize a Git repository in the temporary directory
    const git: SimpleGit = simpleGit(testRepoPath);
    await git.init();

    // Configure Git user for the test repository
    await git.addConfig("user.name", "CI User", true, GitConfigScope.global);
    await git.addConfig(
      "user.email",
      "ci@example.com",
      true,
      GitConfigScope.global
    );

    // Create a file and commit it
    fs.writeFileSync(path.join(testRepoPath, "file1.txt"), "Hello, World!");
    await git.add(".");
    await git.commit("Initial commit");

    // Initialize the Repo class with the test repository path
    repo = new Repo(testRepoUri, clonedRepoPath);

    // Initialize the cloned repository
    await repo.init(); // Clone the repository

    // Check if global Git config has user.name and user.email, and set them if not
    const globalConfig = await simpleGit().listConfig();
    if (!globalConfig.all["user.name"]) {
      await simpleGit().addConfig(
        "user.name",
        "CI User",
        true,
        GitConfigScope.global
      );
    }
    if (!globalConfig.all["user.email"]) {
      await simpleGit().addConfig(
        "user.email",
        "ci@example.com",
        true,
        GitConfigScope.global
      );
    }
  });

  afterEach(() => {
    // Clean up the temporary directories
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
    const git = simpleGit(clonedRepoPath);
    const branchSummary = await git.branch();
    const defaultBranch = branchSummary.current; // Use the default branch
    const commitHash: string = await repo.getCommitHash(defaultBranch);
    expect(commitHash).toBeString();
    expect(commitHash.length).toBe(40); // SHA-1 hash is 40 characters long
  });

  test("checkoutCommit should checkout a specific commit", async () => {
    await repo.init();
    const git = simpleGit(clonedRepoPath);

    // Get the default branch name dynamically
    const branchSummary = await git.branch();
    const defaultBranch = branchSummary.current;

    // Get the latest commit hash for the default branch
    const commitHash: string = await repo.getCommitHash(defaultBranch);

    // Checkout the commit
    await repo.checkoutCommit(commitHash);

    // Verify the checkout
    const log = await git.log();
    expect(log.latest?.hash).toBe(commitHash);
  });

  test("commitChanges should create a new commit", async () => {
    await repo.init();
    const newFilePath: string = path.join(clonedRepoPath, "file2.txt");
    fs.writeFileSync(newFilePath, "New file content");
    await repo.commitChanges(
      newFilePath,
      "New file content",
      "Add file2.txt",
      "Test User <test@example.com>"
    );

    const git: SimpleGit = simpleGit(clonedRepoPath);
    const log = await git.log();
    expect(log.latest?.message).toBe("Add file2.txt");
  });

  test("Concurrent commitChanges calls should execute sequentially", async () => {
    await repo.init();
    const startTime = Date.now();

    // Create file paths
    const filePaths = [
      path.join(clonedRepoPath, "file1.txt"),
      path.join(clonedRepoPath, "file2.txt"),
      path.join(clonedRepoPath, "file3.txt"),
    ];

    // Create the files before committing
    fs.writeFileSync(filePaths[0], "Initial content for file1.txt");
    fs.writeFileSync(filePaths[1], "Initial content for file2.txt");
    fs.writeFileSync(filePaths[2], "Initial content for file3.txt");

    // Run commitChanges concurrently
    await Promise.all([
      repo.commitChanges(
        filePaths[0],
        "Content for Commit 1",
        "Commit 1",
        "User 1 <user1@example.com>"
      ),
      repo.commitChanges(
        filePaths[1],
        "Content for Commit 2",
        "Commit 2",
        "User 2 <user2@example.com>"
      ),
      repo.commitChanges(
        filePaths[2],
        "Content for Commit 3",
        "Commit 3",
        "User 3 <user3@example.com>"
      ),
    ]);

    const endTime = Date.now();

    // Ensure the operations took longer than a single commitChanges call
    expect(endTime - startTime).toBeGreaterThan(200); // Adjusted threshold to 200ms

    // Verify the commits
    const git: SimpleGit = simpleGit(clonedRepoPath);
    const log = await git.log();
    expect(log.total).toBe(4); // Initial commit + 3 new commits

    // Verify the commit messages
    const commitMessages = log.all.map((commit) => commit.message);
    expect(commitMessages).toEqual([
      "Commit 3",
      "Commit 2",
      "Commit 1",
      "Initial commit",
    ]);
  });

  test("getCommitHash should throw an error if no commits are found", async () => {
    await repo.init();
    await expect(repo.getCommitHash("nonexistent-branch")).rejects.toThrow(
      "No commits found for the specified version"
    );
  });

  test("checkoutCommit should throw an error for an invalid commit hash", async () => {
    await repo.init();
    await expect(repo.checkoutCommit("invalid-commit-hash")).rejects.toThrow();
  });

  test("commitChanges should throw an error if the file does not exist", async () => {
    await repo.init();
    const invalidFilePath = path.join(clonedRepoPath, "nonexistent-file.txt");
    await expect(
      repo.commitChanges(
        invalidFilePath,
        "Content",
        "Commit message",
        "User <user@example.com>"
      )
    ).rejects.toThrow("File does not exist");
  });
});
