import { Hono } from "hono";
import Repo from "./repo";
import fs from "fs";
import path from "path";
import os from "os";
import simpleGit from "simple-git";

// Create a new Hono app
const app = new Hono();

// Initialize the Repo class with a dynamic repository path
const testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "test-repo-"));
const clonedRepoPath = fs.mkdtempSync(
  path.join(os.tmpdir(), "test-cloned-repo-")
);

// Initialize a Git repository in the temporary directory
const git = simpleGit(testRepoPath);
await git.init();
fs.writeFileSync(path.join(testRepoPath, "file1.txt"), "Hello, World!");
await git.add(".");
await git.commit("Initial commit");

// Initialize the Repo class with the test repository path
const repo = new Repo(`file://${testRepoPath}`, clonedRepoPath);
await repo.init().catch((err) => {
  console.error("Failed to initialize repository:", err);
});

// Define a route to get the latest commit hash
app.get("/commit-hash/:version", async (c) => {
  const version = c.req.param("version"); // e.g., "main" or a commit hash
  try {
    const commitHash = await repo.getCommitHash(version);
    return c.json({ commitHash });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// Start the server
export default {
  port: 3000,
  fetch: app.fetch,
};
