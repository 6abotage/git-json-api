import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import app from "./index";
import Repo from "./repo";
import fs from "fs";
import path from "path";
import os from "os";
import simpleGit from "simple-git";

describe("API Endpoints", () => {
  let testRepoPath: string;
  let clonedRepoPath: string;

  beforeEach(async () => {
    testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "test-repo-"));
    clonedRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "clone-repo-"));

    // Setup test repository
    const git = simpleGit(testRepoPath);
    await git.init();
    fs.writeFileSync(path.join(testRepoPath, "test.txt"), "test content");
    await git.add(".");
    await git.commit("Initial commit");

    // Mock environment variables
    process.env.REPO_URI = `file://${testRepoPath}`;
    process.env.CLONE_PATH = clonedRepoPath;
  });

  afterEach(() => {
    fs.rmSync(testRepoPath, { recursive: true, force: true });
    fs.rmSync(clonedRepoPath, { recursive: true, force: true });
    delete process.env.REPO_URI;
    delete process.env.CLONE_PATH;
  });

  describe("GET /commit-hash/:version", () => {
    test("should return commit hash for valid branch", async () => {
      const req = new Request(`http://localhost/commit-hash/main`);
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.commitHash).toMatch(/^[a-f0-9]{40}$/);
      expect(data.version).toBe("main");
    });

    test("should handle invalid branch", async () => {
      const req = new Request(`http://localhost/commit-hash/invalid`);
      const res = await app.fetch(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Failed to get commit hash");
    });
  });

  describe("GET /health", () => {
    test("should return health status", async () => {
      const req = new Request(`http://localhost/health`);
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok" });
    });
  });

  describe("Error Handling", () => {
    test("should handle repo initialization failure", async () => {
      process.env.REPO_URI = "invalid-uri";
      const req = new Request(`http://localhost/health`);
      const res = await app.fetch(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Repository initialization failed");
    });
  });
});
