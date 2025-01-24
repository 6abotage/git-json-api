import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import app from "./index";
import Repo from "./repo";
import fs from "fs";
import path from "path";
import os from "os";
import simpleGit from "simple-git";

describe("Hono API", () => {
  let repo: Repo;
  let testRepoPath: string;
  let clonedRepoPath: string;

  beforeEach(async () => {
    // Create a temporary directory for the test repository
    testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "my-test-repo-"));
    clonedRepoPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "my-test-cloned-repo-")
    );

    // Initialize a Git repository in the temporary directory
    const git = simpleGit(testRepoPath);
    await git.init();
    fs.writeFileSync(path.join(testRepoPath, "file1.txt"), "Hello, World!");
    await git.add(".");
    await git.commit("Initial commit");

    // Initialize the Repo class with the test repository path
    repo = new Repo(`file://${testRepoPath}`, clonedRepoPath);
    await repo.init();
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

  test("GET /commit-hash/:version should return the latest commit hash", async () => {
    // Get the default branch name dynamically
    const git = simpleGit(clonedRepoPath);
    const branchSummary = await git.branch();
    const defaultBranch = branchSummary.current;

    // Make the request using the default branch name
    const res = await app.fetch(
      new Request(`http://localhost/commit-hash/${defaultBranch}`)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.commitHash).toBeString();
    expect(data.commitHash.length).toBe(40); // Ensure it's a valid SHA-1 hash
  });
});
